import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { m2UpdateVariantMock, refreshMock } = vi.hoisted(() => ({
  m2UpdateVariantMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/m2-actions", () => ({ m2UpdateVariant: m2UpdateVariantMock }));

import { VariantEditor } from "./variant-editor";

const variant = {
  id: "v-1",
  platform: "instagram",
  title: "Draft title (en)",
  caption: "Provider-disabled draft caption.",
  hashtags: [],
  cta: "Learn more",
  isFinal: false,
  variantLocale: "en-US",
};

describe("VariantEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the returned variant fields and shows variants returned", () => {
    render(<VariantEditor postExternalId="req_1" variants={[variant]} />);

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Draft title (en)");
    expect(screen.getByText(/Draft title \(en\)/)).toBeTruthy();
    expect(screen.getByText(/instagram · draft/)).toBeTruthy();
  });

  it("calls m2UpdateVariant with the edited fields and marks final", async () => {
    m2UpdateVariantMock.mockResolvedValue({ updated: true });
    render(<VariantEditor postExternalId="req_1" variants={[variant]} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New title" } });
    fireEvent.change(screen.getByLabelText("Hashtags (comma separated)"), { target: { value: "#coffee, #baking" } });
    fireEvent.click(screen.getByLabelText("Mark as final variant (required before scheduling)"));

    fireEvent.click(screen.getByRole("button", { name: "Update variant" }));

    expect(await screen.findByText(/Variant updated and marked final/)).toBeTruthy();
    expect(m2UpdateVariantMock).toHaveBeenCalledWith({
      postRequestExternalId: "req_1",
      title: "New title",
      caption: "Provider-disabled draft caption.",
      hashtags: ["#coffee", "#baking"],
      cta: "Learn more",
      isFinal: true,
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("surfaces update failures instead of swallowing them", async () => {
    m2UpdateVariantMock.mockRejectedValue(new Error("Variant not found"));
    render(<VariantEditor postExternalId="req_1" variants={[variant]} />);

    fireEvent.click(screen.getByRole("button", { name: "Update variant" }));

    expect(await screen.findByText("Variant not found")).toBeTruthy();
  });
});
