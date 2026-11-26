"""Entrena y exporta el modelo multietiqueta I1-I11 y el clasificador Phishing.

Ejecutar desde la raíz del repositorio:
    python -m mod_ia_motor.train_export
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputClassifier
from sklearn.pipeline import Pipeline
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import StringTensorType

from .reglas_indicios import construir_texto_modelo, crear_config_reglas

ROOT_DIR = Path(__file__).resolve().parents[1]
DATASET = ROOT_DIR / "data" / "dataset_entrenamiento_IESS_1000.csv"
EXPORT_DIR = Path(__file__).resolve().parent / "export"
INDICIO_COLUMNS = [f"I{index}" for index in range(1, 12)]


def _parse_binary_labels(values: pd.Series, column: str) -> pd.Series:
    normalized = values.astype(str).str.strip().str.lower()
    mapping = {
        "1": 1, "sí": 1, "si": 1, "true": 1, "yes": 1,
        "0": 0, "no": 0, "false": 0,
    }
    parsed = normalized.map(mapping)
    if parsed.isna().any():
        invalid = sorted(normalized[parsed.isna()].unique().tolist())
        raise ValueError(f"Valores inválidos en {column}: {invalid}")
    return parsed.astype(int)


def _pipeline(indicadores: bool = False) -> Pipeline:
    classifier = MultiOutputClassifier(
        LogisticRegression(
            class_weight="balanced",
            solver="liblinear",
            max_iter=1500,
            random_state=42,
        )
    ) if indicadores else LogisticRegression(
        class_weight="balanced",
        solver="liblinear",
        max_iter=1500,
        random_state=42,
    )
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            lowercase=True,
            ngram_range=(1, 2),
            max_features=30000,
            sublinear_tf=True,
        )),
        ("classifier", classifier),
    ])


def main() -> None:
    if not DATASET.is_file():
        raise FileNotFoundError(f"No se encontró el dataset: {DATASET}")

    data = pd.read_csv(DATASET, sep=";", encoding="utf-8-sig", dtype=str, keep_default_na=False)
    required = {"subject", "body", "urls", "attachments_types", "Phishing", *INDICIO_COLUMNS}
    missing = required.difference(data.columns)
    if missing:
        raise ValueError(f"Faltan columnas en el CSV: {sorted(missing)}")
    if len(data) < 20:
        raise ValueError("El dataset debe contener al menos 20 correos.")

    phishing = _parse_binary_labels(data["Phishing"], "Phishing")
    y_indicios = pd.DataFrame({
        col: _parse_binary_labels(data[col], col) for col in INDICIO_COLUMNS
    })

    # Control de coherencia con la regla de negocio acordada.
    phishing_por_indicios = y_indicios.max(axis=1).astype(int)
    if not phishing.equals(phishing_por_indicios):
        inconsistentes = int((phishing != phishing_por_indicios).sum())
        raise ValueError(
            f"Hay {inconsistentes} filas donde Phishing no coincide con la presencia de I1-I11. "
            "Corrija las etiquetas antes de entrenar."
        )

    x = data.apply(lambda row: construir_texto_modelo(row), axis=1)
    indices = range(len(data))
    idx_train, idx_test = train_test_split(
        list(indices), test_size=0.20, random_state=42, stratify=phishing
    )
    x_train, x_test = x.iloc[idx_train], x.iloc[idx_test]
    y_train, y_test = y_indicios.iloc[idx_train], y_indicios.iloc[idx_test]
    p_train, p_test = phishing.iloc[idx_train], phishing.iloc[idx_test]

    modelo_indicios = _pipeline(indicadores=True)
    modelo_phishing = _pipeline(indicadores=False)
    modelo_indicios.fit(x_train, y_train)
    modelo_phishing.fit(x_train, p_train)

    pred_indicios = modelo_indicios.predict(x_test)
    pred_phishing = modelo_phishing.predict(x_test)

    metricas_indicios: dict[str, dict[str, float | int]] = {}
    print("\nMÉTRICAS POR INDICIO (conjunto de prueba):")
    for index, codigo in enumerate(INDICIO_COLUMNS):
        actual = y_test.iloc[:, index]
        predicho = pred_indicios[:, index]
        metricas_indicios[codigo] = {
            "precision": round(float(precision_score(actual, predicho, zero_division=0)), 4),
            "recall": round(float(recall_score(actual, predicho, zero_division=0)), 4),
            "f1": round(float(f1_score(actual, predicho, zero_division=0)), 4),
            "soporte_positivo_test": int(actual.sum()),
        }
        print(
            f"{codigo}: precisión={metricas_indicios[codigo]['precision']:.4f} "
            f"recall={metricas_indicios[codigo]['recall']:.4f} "
            f"F1={metricas_indicios[codigo]['f1']:.4f} "
            f"positivos_test={metricas_indicios[codigo]['soporte_positivo_test']}"
        )

    print("\nMÉTRICAS CLASIFICADOR GLOBAL Phishing:")
    print(classification_report(p_test, pred_phishing, target_names=["No phishing", "Phishing"], zero_division=0))

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    input_type = [("text", StringTensorType([None, 1]))]
    onnx_indicios = convert_sklearn(
        modelo_indicios,
        name="detector_iess_indicios",
        initial_types=input_type,
        options={id(modelo_indicios.named_steps["classifier"]): {"zipmap": False}},
        target_opset=17,
    )
    onnx_phishing = convert_sklearn(
        modelo_phishing,
        name="clasificador_iess_phishing",
        initial_types=input_type,
        options={id(modelo_phishing.named_steps["classifier"]): {"zipmap": False}},
        target_opset=17,
    )
    (EXPORT_DIR / "detector_iess.onnx").write_bytes(onnx_indicios.SerializeToString())
    (EXPORT_DIR / "clasificador_phishing.onnx").write_bytes(onnx_phishing.SerializeToString())
    with (EXPORT_DIR / "config_reglas.json").open("w", encoding="utf-8") as archivo:
        json.dump(crear_config_reglas(), archivo, ensure_ascii=False, indent=2)
        archivo.write("\n")

    metadata = {
        "fecha_entrenamiento_utc": datetime.now(timezone.utc).isoformat(),
        "dataset": DATASET.name,
        "dataset_sha256": hashlib.sha256(DATASET.read_bytes()).hexdigest(),
        "registros": int(len(data)),
        "registros_entrenamiento": int(len(idx_train)),
        "registros_prueba": int(len(idx_test)),
        "regla_negocio_validada_en_dataset": True,
        "metricas_indicios": metricas_indicios,
        "clasificador_phishing": "LogisticRegression + TF-IDF; probabilidades no calibradas",
    }
    with (EXPORT_DIR / "metadata_entrenamiento.json").open("w", encoding="utf-8") as archivo:
        json.dump(metadata, archivo, ensure_ascii=False, indent=2)
        archivo.write("\n")

    print(f"\nModelos exportados correctamente en: {EXPORT_DIR}")
    print(" - detector_iess.onnx")
    print(" - clasificador_phishing.onnx")
    print(" - config_reglas.json")
    print(" - metadata_entrenamiento.json")


if __name__ == "__main__":
    main()
