import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VoiceStudio } from "./voice-studio";

describe("estúdio de voz", () => {
  it("orienta todo o fluxo em português do Brasil", () => {
    render(<VoiceStudio />);

    expect(
      screen.getByRole("heading", { name: "Escreva o que será falado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Texto em português do Brasil"),
    ).toHaveAttribute("maxlength", "300");
    expect(
      screen.getByRole("button", { name: /Gravar minha voz/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Gerar áudio com minha voz" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/marca-d’água digital do modelo/i),
    ).toBeInTheDocument();
  });

  it("valida o texto antes de enviar a síntese", () => {
    render(<VoiceStudio />);

    fireEvent.click(
      screen.getByRole("button", { name: "Gerar áudio com minha voz" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escreva o texto em português do Brasil que você quer ouvir.",
    );
  });
});
