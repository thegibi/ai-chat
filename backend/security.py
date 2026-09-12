from __future__ import annotations

import os
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

MAX_TEXT_LENGTH = 300
MAX_AUDIO_BYTES = 15 * 1024 * 1024
MAX_GENERATED_AUDIO_BYTES = 50 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024


class InputError(ValueError):
    """Erro seguro que pode ser apresentado para a pessoa usuária."""


@dataclass(frozen=True)
class AudioFormat:
    name: str
    suffix: str
    media_types: frozenset[str]


FORMATS = {
    "wav": AudioFormat(
        "WAV",
        ".wav",
        frozenset({"audio/wav", "audio/x-wav", "audio/wave"}),
    ),
    "mp3": AudioFormat(
        "MP3",
        ".mp3",
        frozenset({"audio/mpeg", "audio/mp3"}),
    ),
    "mp4": AudioFormat(
        "M4A",
        ".m4a",
        frozenset({"audio/mp4", "audio/m4a", "audio/x-m4a", "video/mp4"}),
    ),
    "webm": AudioFormat(
        "WebM",
        ".webm",
        frozenset({"audio/webm", "video/webm"}),
    ),
    "ogg": AudioFormat(
        "OGG",
        ".ogg",
        frozenset({"audio/ogg", "application/ogg"}),
    ),
    "flac": AudioFormat(
        "FLAC",
        ".flac",
        frozenset({"audio/flac", "audio/x-flac"}),
    ),
}

GENERIC_MEDIA_TYPES = frozenset({"", "application/octet-stream"})


def normalize_text(raw_text: str | None) -> str:
    if raw_text is None:
        raise InputError(
            "Escreva o texto em português do Brasil que você quer ouvir."
        )

    text = unicodedata.normalize("NFC", raw_text).strip()
    if not text:
        raise InputError(
            "Escreva o texto em português do Brasil que você quer ouvir."
        )

    if len(text) > MAX_TEXT_LENGTH:
        raise InputError(
            f"O texto pode ter no máximo {MAX_TEXT_LENGTH} caracteres."
        )

    if not any(character.isalpha() for character in text):
        raise InputError(
            "O texto precisa incluir pelo menos uma palavra em português."
        )

    for character in text:
        category = unicodedata.category(character)
        if category.startswith("C") and not character.isspace():
            raise InputError("O texto contém caracteres de controle inválidos.")

    return " ".join(text.split())


def require_voice_consent(raw_consent: str | None) -> None:
    if (raw_consent or "").strip().lower() not in {"true", "1", "sim"}:
        raise InputError(
            "Confirme que a voz é sua e que você autoriza a síntese."
        )


def detect_audio_format(header: bytes) -> AudioFormat | None:
    if (
        len(header) >= 12
        and header[:4] == b"RIFF"
        and header[8:12] == b"WAVE"
    ):
        return FORMATS["wav"]
    if header.startswith(b"fLaC"):
        return FORMATS["flac"]
    if header.startswith(b"OggS"):
        return FORMATS["ogg"]
    if header.startswith(b"\x1aE\xdf\xa3"):
        return FORMATS["webm"]
    if len(header) >= 12 and header[4:8] == b"ftyp":
        return FORMATS["mp4"]
    if header.startswith(b"ID3") or (
        len(header) >= 2
        and header[0] == 0xFF
        and header[1] & 0xE0 == 0xE0
    ):
        return FORMATS["mp3"]
    return None


async def read_audio_upload(upload: UploadFile | None) -> tuple[bytes, AudioFormat]:
    if upload is None:
        raise InputError("Grave ou envie uma amostra da sua própria voz.")

    media_type = (upload.content_type or "").lower().split(";", 1)[0].strip()
    supported_media_types = {
        item for audio_format in FORMATS.values() for item in audio_format.media_types
    }
    if media_type not in GENERIC_MEDIA_TYPES and media_type not in supported_media_types:
        raise InputError("Use uma gravação WAV, MP3, M4A, WebM, OGG ou FLAC.")

    content = bytearray()
    while chunk := await upload.read(READ_CHUNK_BYTES):
        content.extend(chunk)
        if len(content) > MAX_AUDIO_BYTES:
            raise InputError("A gravação pode ter no máximo 15 MB.")

    if not content:
        raise InputError("A gravação está vazia. Grave ou escolha outro arquivo.")

    detected_format = detect_audio_format(bytes(content[:32]))
    if detected_format is None:
        raise InputError(
            "O arquivo não contém uma gravação de áudio reconhecida."
        )

    if (
        media_type not in GENERIC_MEDIA_TYPES
        and media_type not in detected_format.media_types
    ):
        raise InputError(
            "O conteúdo da gravação não corresponde ao formato informado."
        )

    return bytes(content), detected_format


def write_private_file(
    directory: Path, filename: str, content: bytes
) -> Path:
    path = directory / filename
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        0o600,
    )
    try:
        with os.fdopen(descriptor, "wb") as file:
            file.write(content)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return path


def read_generated_wave(path: Path) -> bytes:
    if not path.is_file():
        raise RuntimeError("O modelo não criou o arquivo de áudio.")

    size = path.stat().st_size
    if size < 44 or size > MAX_GENERATED_AUDIO_BYTES:
        raise RuntimeError("O modelo criou um arquivo de áudio inválido.")

    with path.open("rb") as file:
        content = file.read(MAX_GENERATED_AUDIO_BYTES + 1)

    if (
        len(content) > MAX_GENERATED_AUDIO_BYTES
        or content[:4] != b"RIFF"
        or content[8:12] != b"WAVE"
    ):
        raise RuntimeError("O modelo criou um arquivo WAV inválido.")

    return content
