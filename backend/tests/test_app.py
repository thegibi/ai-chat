from __future__ import annotations

import io
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.engine import get_engine


def wave_bytes() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16_000)
        wav_file.writeframes(b"\x00\x00" * 1_600)
    return buffer.getvalue()


class FakeEngine:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def synthesize(
        self, text: str, reference_audio: Path, output_audio: Path
    ) -> None:
        self.calls.append(
            {
                "texto": text,
                "nome_amostra": reference_audio.name,
                "conteudo_amostra": reference_audio.read_bytes(),
            }
        )
        output_audio.write_bytes(wave_bytes())


@pytest.fixture
def fake_engine() -> FakeEngine:
    engine = FakeEngine()
    app.dependency_overrides[get_engine] = lambda: engine
    yield engine
    app.dependency_overrides.clear()


@pytest.fixture
def client(fake_engine: FakeEngine) -> TestClient:
    del fake_engine
    return TestClient(app, raise_server_exceptions=False)


def test_health_reports_portuguese_model_configuration(client: TestClient) -> None:
    response = client.get("/saude")

    assert response.status_code == 200
    assert response.json()["status"] == "pronto"
    assert response.json()["idioma"] == "pt-BR"
    assert response.json()["versao_modelo"] == "v3"


def test_synthesis_uses_safe_temporary_name_and_returns_wave(
    client: TestClient, fake_engine: FakeEngine
) -> None:
    sample = wave_bytes()

    response = client.post(
        "/sintetizar",
        data={
            "texto": "  Olá,\nesta voz é minha.  ",
            "consentimento": "true",
        },
        files={
            "amostra": (
                "../../arquivo-perigoso.wav",
                sample,
                "audio/wav",
            )
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.headers["x-synthesis-language"] == "pt-BR"
    assert response.headers["x-audio-watermarked"] == "true"
    assert response.content[:4] == b"RIFF"
    assert fake_engine.calls == [
        {
            "texto": "Olá, esta voz é minha.",
            "nome_amostra": "amostra.wav",
            "conteudo_amostra": sample,
        }
    ]


def test_synthesis_requires_explicit_voice_consent(client: TestClient) -> None:
    response = client.post(
        "/sintetizar",
        data={"texto": "Esta frase está em português."},
        files={"amostra": ("voz.wav", wave_bytes(), "audio/wav")},
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "Confirme que a voz é sua e que você autoriza a síntese."
    )


def test_synthesis_rejects_file_with_fake_audio_type(client: TestClient) -> None:
    response = client.post(
        "/sintetizar",
        data={
            "texto": "Esta frase está em português.",
            "consentimento": "true",
        },
        files={"amostra": ("voz.wav", b"\x89PNG\r\n\x1a\n", "audio/wav")},
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "O arquivo não contém uma gravação de áudio reconhecida."
    )


def test_synthesis_rejects_non_audio_media_type(client: TestClient) -> None:
    response = client.post(
        "/sintetizar",
        data={
            "texto": "Esta frase está em português.",
            "consentimento": "true",
        },
        files={"amostra": ("voz.txt", wave_bytes(), "text/plain")},
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "Use uma gravação WAV, MP3, M4A, WebM, OGG ou FLAC."
    )


def test_unknown_route_has_portuguese_message(client: TestClient) -> None:
    response = client.get("/rota-inexistente")

    assert response.status_code == 404
    assert response.json()["detail"] == "Recurso não encontrado."
