"""LightGBM (Ke et al. 2017): quarto componente dell'insieme pubblicato (pipeline/model.py).

Alberi a crescita per foglia, valori mancanti gestiti nativamente. Provato prima in pipeline/experiment_extensions.py,
come modello singolo e come quarto membro: da solo batte HistGradientBoosting (AUC +0.007 dal 2005, +0.012 dal 2015);
come membro dell'insieme migliora le misure di poco (AUC +0.001 / +0.002) con un intervallo al 90% che include lo zero
(numeri in docs/extensions.md). E' stato attivato comunque, per scelta del progetto, dalla prima edizione mensile successiva
(2026-12). Il confronto con e senza LightGBM viene ricalcolato a ogni edizione e compare nella pagina Method.

`deterministic` e `force_row_wise` danno lo stesso risultato qualunque sia il numero di thread (runner a 4 core, portatile a 8).
"""
from __future__ import annotations


def make_lgbm():
    import lightgbm as lgb
    return lgb.LGBMClassifier(n_estimators=250, learning_rate=0.03, num_leaves=8, min_child_samples=80, subsample=0.7, subsample_freq=1,
                              colsample_bytree=0.6, reg_lambda=5.0, deterministic=True, force_row_wise=True, verbose=-1, n_jobs=-1,
                              random_state=0)
