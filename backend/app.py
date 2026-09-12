from __future__ import annotations

import logging
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.engine import (
    LANGUAGE_LOCALE,
    MODEL_ID,
    MODEL_VARIANT,
    SpeechSynthesizer,
    get_engine,
)
from backend.security import (
    InputError,
    MAX_AUDIO_BYTES,
    normalize_text,
    read_audio_upload,
    read_generated_wave,
    require_voice_consent,
    write_private_file,
)

logger = logging.getLogger("voz-local")
MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024 * 1024

app = FastAPI(
    title="Voz Local",
    description="Síntese local da própria voz em português do Brasil.",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def json_error(detail: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/sintetizar":
        declared_length = request.headers.get("content-length")
        if declared_length:
            try:
                if int(declared_length) > MAX_REQUEST_BYTES:
                    return json_error(
                        "O envio completo pode ter no máximo 16 MB.",
                        413,
                    )
            except ValueError:
                return json_error(
                    "O tamanho informado para o envio é inválido.",
                    400,
                )
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _request: Request, _exception: RequestValidationError
) -> JSONResponse:
    return json_error("Os dados enviados não são válidos.", 422)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(
    _request: Request, exception: StarletteHTTPException
) -> JSONResponse:
    if exception.status_code == 404:
        detail = "Recurso não encontrado."
    elif exception.status_code == 405:
        detail = "Método não permitido para este recurso."
    elif exception.status_code == 400:
        detail = "Não foi possível interpretar a solicitação."
    elif (
        exception.status_code in {422, 500}
        and isinstance(exception.detail, str)
        and exception.detail
    ):
        detail = exception.detail
    else:
        detail = "A solicitação não pôde ser concluída."
    return json_error(detail, exception.status_code)


@app.exception_handler(Exception)
async def unexpected_error_handler(
    _request: Request, exception: Exception
) -> JSONResponse:
    logger.exception("Falha inesperada no serviço de voz.", exc_info=exception)
    return json_error(
        "O serviço local encontrou um erro inesperado.",
        500,
    )


@app.get("/saude")
async def health() -> dict[str, object]:
    engine = get_engine()
    return {
        "status": "pronto",
        "idioma": LANGUAGE_LOCALE,
        "modelo": MODEL_ID,
        "versao_modelo": MODEL_VARIANT,
        "modelo_carregado": engine.is_loaded,
        "dispositivo": engine.device or "detectado no primeiro uso",
    }


@app.post("/sintetizar")
async def synthesize(
    texto: Annotated[str | None, Form()] = None,
    consentimento: Annotated[str | None, Form()] = None,
    amostra: Annotated[UploadFile | None, File()] = None,
    engine: SpeechSynthesizer = Depends(get_engine),
) -> Response:
    try:
        normalized_text = normalize_text(texto)
        require_voice_consent(consentimento)
        audio_content, audio_format = await read_audio_upload(amostra)
    except InputError as input_error:
        raise HTTPException(status_code=422, detail=str(input_error)) from input_error
    finally:
        if amostra is not None:
            await amostra.close()

    try:
        with TemporaryDirectory(prefix="voz-local-") as temporary_directory:
            directory = Path(temporary_directory)
            reference_path = write_private_file(
                directory,
                f"amostra{audio_format.suffix}",
                audio_content,
            )
            output_path = directory / "voz-gerada.wav"

            await run_in_threadpool(
                engine.synthesize,
                normalized_text,
                reference_path,
                output_path,
            )

            if output_path.exists():
                os.chmod(output_path, 0o600)
            generated_audio = read_generated_wave(output_path)
    except Exception as synthesis_error:
        logger.exception("A síntese local falhou.", exc_info=synthesis_error)
        raise HTTPException(
            status_code=500,
            detail=(
                "Não foi possível gerar o áudio. Confira a instalação do "
                "modelo local e tente novamente."
            ),
        ) from synthesis_error

    return Response(
        content=generated_audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'attachment; filename="minha-voz-em-portugues.wav"',
            "X-Audio-Watermarked": "true",
            "X-Content-Type-Options": "nosniff",
            "X-Synthesis-Language": LANGUAGE_LOCALE,
        },
    )
