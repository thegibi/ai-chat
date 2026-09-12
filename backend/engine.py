from __future__ import annotations

import os
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Protocol

LANGUAGE_ID = "pt"
LANGUAGE_LOCALE = "pt-BR"
MODEL_ID = "ResembleAI/chatterbox"
MODEL_VARIANT = "v3"

ModelLoader = Callable[[str, str], Any]
AudioWriter = Callable[[Path, Any, int], None]


class SpeechSynthesizer(Protocol):
    def synthesize(
        self, text: str, reference_audio: Path, output_audio: Path
    ) -> None: ...


class ChatterboxEngine:
    """Adaptador local com idioma e variante do modelo fixados."""

    language_id = LANGUAGE_ID
    locale = LANGUAGE_LOCALE
    model_id = MODEL_ID
    model_variant = MODEL_VARIANT

    def __init__(
        self,
        *,
        device: str | None = None,
        model_loader: ModelLoader | None = None,
        audio_writer: AudioWriter | None = None,
    ) -> None:
        self._configured_device = (
            device or os.getenv("TTS_DEVICE", "auto")
        ).strip().lower()
        self._model_loader = model_loader
        self._audio_writer = audio_writer
        self._model: Any | None = None
        self._device: str | None = None
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def device(self) -> str | None:
        return self._device

    def _resolve_device(self) -> str:
        if self._configured_device not in {"auto", "cpu", "cuda", "mps"}:
            raise RuntimeError(
                "TTS_DEVICE deve ser auto, cpu, cuda ou mps."
            )

        if self._configured_device == "cpu":
            return "cpu"

        import torch

        if self._configured_device == "cuda":
            if not torch.cuda.is_available():
                raise RuntimeError(
                    "TTS_DEVICE está como cuda, mas nenhuma GPU CUDA está disponível."
                )
            return "cuda"

        if self._configured_device == "mps":
            if not torch.backends.mps.is_available():
                raise RuntimeError(
                    "TTS_DEVICE está como mps, mas o recurso não está disponível."
                )
            return "mps"

        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    @staticmethod
    def _default_model_loader(device: str, variant: str) -> Any:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        return ChatterboxMultilingualTTS.from_pretrained(
            device=device,
            t3_model=variant,
        )

    @staticmethod
    def _default_audio_writer(
        output_path: Path, waveform: Any, sample_rate: int
    ) -> None:
        import torchaudio

        torchaudio.save(
            str(output_path),
            waveform.detach().cpu(),
            sample_rate,
            format="wav",
        )

    def _get_model(self) -> Any:
        if self._model is not None:
            return self._model

        with self._load_lock:
            if self._model is None:
                self._device = self._resolve_device()
                loader = self._model_loader or self._default_model_loader
                self._model = loader(self._device, self.model_variant)

        return self._model

    def synthesize(
        self, text: str, reference_audio: Path, output_audio: Path
    ) -> None:
        model = self._get_model()
        writer = self._audio_writer or self._default_audio_writer

        # O modelo mantém condicionais da voz em memória; uma trava evita que
        # duas solicitações misturem amostras de pessoas diferentes.
        with self._inference_lock:
            waveform = model.generate(
                text,
                language_id=self.language_id,
                audio_prompt_path=str(reference_audio),
                exaggeration=0.5,
                cfg_weight=0.5,
            )
            writer(output_audio, waveform, model.sr)


@lru_cache(maxsize=1)
def get_engine() -> ChatterboxEngine:
    return ChatterboxEngine()
