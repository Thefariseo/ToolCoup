"""LightGBM (Ke et al. 2017) come classificatore per i golpe: alberi a crescita per foglia, valori mancanti gestiti nativamente.

Provato in pipeline/experiment_extensions.py come singolo modello e come quarto membro dell'insieme. Per attivarlo nel modello pubblicato:
in pipeline/model.py aggiungere  "lgbm": (make_lgbm, ALL_FEATURES)  a SPECS, "lgbm" a ENSEMBLE e importare make_lgbm da questo modulo.
"""
from __future__ import annotations


def make_lgbm():
    import lightgbm as lgb
    return lgb.LGBMClassifier(n_estimators=250, learning_rate=0.03, num_leaves=8, min_child_samples=80, subsample=0.7, subsample_freq=1,
                              colsample_bytree=0.6, reg_lambda=5.0, verbose=-1, n_jobs=-1, random_state=0)
