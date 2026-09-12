from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from backend.engine import ChatterboxEngine


class FakeModel:
    sr = 24_000

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def generate(self, text: str, **options):
        self.calls.append({"texto": text, **options})
        return SimpleNamespace()


def test_engine_fixes_model_v3_and_portuguese_language(tmp_path: Path) -> None:
    model = FakeModel()
    loader_calls: list[tuple[str, str]] = []
    writer_calls: list[tuple[Path, object, int]] = []

    def load_model(device: str, variant: str) -> FakeModel:
        loader_calls.append((device, variant))
        return model

    def write_audio(path: Path, waveform: object, sample_rate: int) -> None:
        writer_calls.append((path, waveform, sample_rate))

    engine = ChatterboxEngine(
        device="cpu",
        model_loader=load_model,
        audio_writer=write_audio,
    )
    reference = tmp_path / "minha-voz.wav"
    output = tmp_path / "resultado.wav"
    reference.write_bytes(b"amostra")

    engine.synthesize(
        "Olá! Esta frase deve soar em português do Brasil.",
        reference,
        output,
    )

    assert loader_calls == [("cpu", "v3")]
    assert model.calls == [
        {
            "texto": "Olá! Esta frase deve soar em português do Brasil.",
            "language_id": "pt",
            "audio_prompt_path": str(reference),
            "exaggeration": 0.5,
            "cfg_weight": 0.5,
        }
    ]
    assert writer_calls[0][0] == output
    assert writer_calls[0][2] == 24_000
    assert engine.locale == "pt-BR"
