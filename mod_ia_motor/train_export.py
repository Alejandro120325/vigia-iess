"""Entrena el detector multi-etiqueta y exporta el modelo ONNX y las reglas."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputClassifier
from sklearn.pipeline import Pipeline
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import StringTensorType

from reglas_indicios import construir_texto_modelo, crear_config_reglas


HERE = Path(__file__).resolve().parent
DATASET = HERE.parent / "data" / "dataset_entrenamiento_IESS_1000.csv"
EXPORT_DIR = HERE / "export"
INDICIO_COLUMNS = [f"I{index}" for index in range(1, 12)]


def _parse_binary_labels(values: pd.Series, column: str) -> pd.Series:
    normalized = values.astype(str).str.strip().str.lower()
    mapping = {"1": 1, "sí": 1, "si": 1, "true": 1, "yes": 1, "0": 0, "no": 0, "false": 0}
    parsed = normalized.map(mapping)
    if parsed.isna().any():
        invalid = sorted(normalized[parsed.isna()].unique().tolist())
        raise ValueError(f"Valores inválidos en {column}: {invalid}")
    return parsed.astype(int)


def main() -> None:
    if not DATASET.is_file():
        raise FileNotFoundError(f"No se encontró el dataset esperado: {DATASET}")

    data = pd.read_csv(DATASET, sep=";", encoding="utf-8-sig", dtype=str, keep_default_na=False)
    required = {"subject", "body", "urls", "attachments_types", *INDICIO_COLUMNS}
    missing = required.difference(data.columns)
    if missing:
        raise ValueError(f"Faltan columnas requeridas en el CSV: {sorted(missing)}")
    if len(data) < 5:
        raise ValueError("Se requieren al menos cinco correos para entrenar y evaluar.")

    x = data.apply(lambda row: construir_texto_modelo(row), axis=1)
    y = pd.DataFrame({
        column: _parse_binary_labels(data[column], column)
        for column in INDICIO_COLUMNS
    })
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            lowercase=True,
            ngram_range=(1, 2),
            max_features=30000,
            sublinear_tf=True,
        )),
        ("classifier", MultiOutputClassifier(
            LogisticRegression(
                class_weight="balanced",
                solver="liblinear",
                max_iter=1000,
                random_state=42,
            )
        )),
    ])
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)

    print("Métricas por indicio (conjunto de evaluación):")
    for index, code in enumerate(INDICIO_COLUMNS):
        actual = y_test.iloc[:, index]
        predicted = predictions[:, index]
        print(
            f"{code}: F1={f1_score(actual, predicted, zero_division=0):.3f} "
            f"Precisión={precision_score(actual, predicted, zero_division=0):.3f}"
        )

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_model = convert_sklearn(
        pipeline,
        name="detector_iess",
        initial_types=[("text", StringTensorType([None, 1]))],
        options={id(pipeline.named_steps["classifier"]): {"zipmap": False}},
        target_opset=17,
    )
    (EXPORT_DIR / "detector_iess.onnx").write_bytes(onnx_model.SerializeToString())
    with (EXPORT_DIR / "config_reglas.json").open("w", encoding="utf-8") as file:
        json.dump(crear_config_reglas(), file, ensure_ascii=False, indent=2)
        file.write("\n")

    print(f"\nArtefactos exportados en: {EXPORT_DIR}")


if __name__ == "__main__":
    main()
