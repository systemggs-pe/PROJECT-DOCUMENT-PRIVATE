import { describe, expect, it } from "vitest";

import { newDraft, newElement, normalizeDraft, snapElement, validateDraftForSave } from "./model";

describe("studio editor model", () => {
  it("keeps document coordinates in points and clamps invalid geometry", () => {
    const draft = newDraft();
    const element = newElement("TEXT", 1);
    const normalized = normalizeDraft({
      ...draft,
      elements: [{ ...element, x: Number.NaN, y: -20, width: -1, height: Number.POSITIVE_INFINITY }],
    });

    expect(normalized.elements[0]).toMatchObject({ x: 0, y: 0, width: 1 });
    expect(normalized.elements[0]?.height).toBeGreaterThan(0);
    expect(validateDraftForSave(normalized)).toBeNull();
  });

  it("snaps elements to document edges and centers without changing zoom data", () => {
    const draft = newDraft();
    const element = { ...newElement("RECTANGLE", 1), x: 221, y: 370, width: 150, height: 100 };
    const snapped = snapElement(element, draft, 5);

    expect(snapped.x).toBeCloseTo((draft.width - element.width) / 2);
    expect(snapped.y).toBeCloseTo((draft.height - element.height) / 2);
  });

  it("rejects repeated image slot keys before save", () => {
    const draft = newDraft(true);
    const invalid = {
      ...draft,
      elements: draft.elements.map((element) => ({ ...element, key: "dni_front" })),
    };

    expect(validateDraftForSave(invalid)).toContain("repetida");
  });
});
