"""Un Temporal Fusion Transformer compatto (Lim et al. 2021) per le serie mensili ACLED di ogni paese. Solo per gli esperimenti: richiede PyTorch.

Perche' in casa e non una libreria: le librerie (pytorch-forecasting, darts) portano dipendenze pesanti e versioni in conflitto con quelle fissate
in pipeline/requirements.txt; qui servono duecento righe e il pieno controllo del legame con il resto della validazione.

Architettura, come nell'articolo: Gated Residual Network (GRN) e unita' a porta (GLU); selezione delle variabili nel tempo (una rete per variabile,
pesi softmax); contesto statico (regione, regime, reddito) che inizializza l'LSTM e arricchisce l'uscita; encoder LSTM sulla finestra passata e
decoder LSTM sugli orizzonti futuri con soli ingressi noti (il mese dell'anno); attenzione multi-testa interpretabile (valori condivisi) con
maschera causale; connessioni residue con porta; uscite: quantili 10/50/90 del logaritmo dei conteggi futuri (proteste e violenza, orizzonti 1..6) e
due logit per gli eventi (ondata di proteste, escalation di violenza a tre mesi). Perdita: pinball sui quantili piu' entropia incrociata.

Uso: dall'esperimento (pipeline/experiment_unrest.py); non fa parte del flusso mensile finche' non supera il test fuori campione.
"""
from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

QUANTILES = (0.1, 0.5, 0.9)


class GLU(nn.Module):
    def __init__(self, d_in: int, d_out: int, dropout: float = 0.0):
        super().__init__()
        self.drop, self.fc = nn.Dropout(dropout), nn.Linear(d_in, d_out * 2)

    def forward(self, x):
        return Fn.glu(self.fc(self.drop(x)), dim=-1)


class GRN(nn.Module):
    """Gated Residual Network: non linearita' solo quando serve (la porta puo' chiuderla), contesto opzionale."""
    def __init__(self, d_in: int, d_hidden: int, d_out: int, d_ctx: int | None = None, dropout: float = 0.1):
        super().__init__()
        self.fc1, self.fc2 = nn.Linear(d_in, d_hidden), nn.Linear(d_hidden, d_hidden)
        self.ctx = nn.Linear(d_ctx, d_hidden, bias=False) if d_ctx else None
        self.gate, self.norm = GLU(d_hidden, d_out, dropout), nn.LayerNorm(d_out)
        self.skip = nn.Linear(d_in, d_out) if d_in != d_out else nn.Identity()

    def forward(self, x, ctx=None):
        h = self.fc1(x)
        if self.ctx is not None and ctx is not None:
            h = h + self.ctx(ctx)
        h = self.fc2(Fn.elu(h))
        return self.norm(self.skip(x) + self.gate(h))


class VariableSelection(nn.Module):
    """Pesi softmax sulle variabili (per ogni passo) e GRN per variabile; restituisce la combinazione e i pesi."""
    def __init__(self, n_vars: int, d: int, d_ctx: int | None = None, dropout: float = 0.1):
        super().__init__()
        self.n, self.d = n_vars, d
        self.per_var = nn.ModuleList([GRN(1, d, d, dropout=dropout) for _ in range(n_vars)])
        self.weights = GRN(n_vars, d, n_vars, d_ctx, dropout)

    def forward(self, x, ctx=None):                              # x: (B, T, n_vars)
        w = Fn.softmax(self.weights(x, None if ctx is None else ctx.unsqueeze(1)), dim=-1)           # (B, T, n)
        z = torch.stack([g(x[..., i:i + 1]) for i, g in enumerate(self.per_var)], dim=-2)             # (B, T, n, d)
        return (z * w.unsqueeze(-1)).sum(dim=-2), w


class InterpretableAttention(nn.Module):
    """Attenzione multi-testa con valori condivisi: le teste si mediano e restano leggibili come un'unica mappa di attenzione."""
    def __init__(self, d: int, heads: int = 2, dropout: float = 0.1):
        super().__init__()
        self.h, self.dk = heads, d // heads
        self.q, self.k = nn.Linear(d, d), nn.Linear(d, d)
        self.v = nn.Linear(d, self.dk)
        self.out, self.drop = nn.Linear(self.dk, d), nn.Dropout(dropout)

    def forward(self, x, mask):                                   # x: (B, L, d); mask: (L, L) True = vietato
        B, L, _ = x.shape
        q = self.q(x).view(B, L, self.h, self.dk).transpose(1, 2)
        k = self.k(x).view(B, L, self.h, self.dk).transpose(1, 2)
        a = (q @ k.transpose(-1, -2)) / self.dk ** 0.5
        a = Fn.softmax(a.masked_fill(mask, float("-inf")), dim=-1)
        a = self.drop(a)
        v = self.v(x).unsqueeze(1)                                 # (B, 1, L, dk): condiviso tra le teste
        return self.out((a @ v).mean(dim=1)), a.mean(dim=1)


class TFT(nn.Module):
    def __init__(self, n_past: int, n_known: int, n_static: int, n_regions: int, horizons: int = 6, d: int = 32, heads: int = 2, dropout: float = 0.15):
        super().__init__()
        self.H, self.d = horizons, d
        self.region = nn.Embedding(n_regions, 8)
        self.static_vsn = nn.Sequential(nn.Linear(n_static + 8, d), nn.ELU())
        self.ctx_vsn, self.ctx_h, self.ctx_c, self.ctx_enrich = (GRN(d, d, d, dropout=dropout) for _ in range(4))
        self.past_vsn = VariableSelection(n_past, d, d, dropout)
        self.known_vsn = VariableSelection(n_known, d, d, dropout)
        self.enc, self.dec = nn.LSTM(d, d, batch_first=True), nn.LSTM(d, d, batch_first=True)
        self.lstm_gate, self.lstm_norm = GLU(d, d, dropout), nn.LayerNorm(d)
        self.enrich = GRN(d, d, d, d, dropout)
        self.attn = InterpretableAttention(d, heads, dropout)
        self.attn_gate, self.attn_norm = GLU(d, d, dropout), nn.LayerNorm(d)
        self.ff = GRN(d, d, d, dropout=dropout)
        self.ff_gate, self.ff_norm = GLU(d, d, dropout), nn.LayerNorm(d)
        self.quant = nn.Linear(d, 2 * len(QUANTILES))              # per ogni orizzonte: 3 quantili di proteste e 3 di violenza
        self.event = nn.Linear(d * 2, 2)                           # ondata di proteste, escalation di violenza

    def forward(self, past, known, static_real, region):
        B, W, _ = past.shape
        s = self.static_vsn(torch.cat([static_real, self.region(region)], dim=-1))
        c_vsn, c_h, c_c, c_en = self.ctx_vsn(s), self.ctx_h(s), self.ctx_c(s), self.ctx_enrich(s)
        zp, wp = self.past_vsn(past, c_vsn)
        zk, wk = self.known_vsn(known, c_vsn)
        h0, c0 = c_h.unsqueeze(0).contiguous(), c_c.unsqueeze(0).contiguous()
        enc, (h, c) = self.enc(zp, (h0, c0))
        dec, _ = self.dec(zk, (h, c))
        seq = torch.cat([enc, dec], dim=1)
        skip = torch.cat([zp, zk], dim=1)
        x = self.lstm_norm(skip + self.lstm_gate(seq))
        x = self.enrich(x, c_en.unsqueeze(1).expand(-1, x.shape[1], -1))
        L = x.shape[1]
        mask = torch.triu(torch.ones(L, L, dtype=torch.bool), diagonal=1)
        a, attn = self.attn(x, mask)
        x = self.attn_norm(x + self.attn_gate(a))
        x = self.ff_norm(x + self.ff_gate(self.ff(x)))
        fut = x[:, W:, :]                                           # (B, H, d)
        q = self.quant(fut).view(B, self.H, 2, len(QUANTILES))      # (B, H, serie, quantile)
        ev = self.event(torch.cat([x[:, W - 1, :], fut.mean(dim=1)], dim=-1))
        return q, ev, {"past_weights": wp.mean(dim=(0, 1)).detach(), "attention": attn.mean(dim=0).detach()}


def pinball(pred, target, mask):
    """pred (B,H,S,Q), target (B,H,S), mask (B,H,S): perdita quantile media sui valori noti."""
    qs = torch.tensor(QUANTILES, dtype=pred.dtype).view(1, 1, 1, -1)
    e = target.unsqueeze(-1) - pred
    loss = torch.maximum(qs * e, (qs - 1) * e) * mask.unsqueeze(-1)
    return loss.sum() / (mask.sum() * len(QUANTILES)).clamp(min=1)


def fit(model: TFT, tensors: dict, epochs: int = 14, batch: int = 512, lr: float = 2e-3, seed: int = 0, log=None) -> TFT:
    """tensors: past, known, static, region, y_q (B,H,S), m_q (B,H,S), y_e (B,2), m_e (B,2)."""
    torch.manual_seed(seed); np.random.seed(seed)
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=epochs * ((len(tensors["past"]) + batch - 1) // batch))
    n = len(tensors["past"])
    for ep in range(epochs):
        model.train()
        perm = torch.randperm(n)
        total = 0.0
        for i in range(0, n, batch):
            ix = perm[i:i + batch]
            q, ev, _ = model(tensors["past"][ix], tensors["known"][ix], tensors["static"][ix], tensors["region"][ix])
            lq = pinball(q, tensors["y_q"][ix], tensors["m_q"][ix])
            le = (Fn.binary_cross_entropy_with_logits(ev, tensors["y_e"][ix], reduction="none") * tensors["m_e"][ix]).sum() / tensors["m_e"][ix].sum().clamp(min=1)
            loss = lq + le
            opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step()
            total += float(loss) * len(ix)
        if log:
            log(f"    epoca {ep + 1}/{epochs}: perdita {total / n:.4f}")
    return model


@torch.no_grad()
def predict(model: TFT, tensors: dict, batch: int = 2048):
    model.eval()
    qs, evs = [], []
    for i in range(0, len(tensors["past"]), batch):
        sl = slice(i, i + batch)
        q, ev, _ = model(tensors["past"][sl], tensors["known"][sl], tensors["static"][sl], tensors["region"][sl])
        qs.append(q); evs.append(ev)
    return torch.cat(qs).numpy(), torch.cat(evs).numpy()
