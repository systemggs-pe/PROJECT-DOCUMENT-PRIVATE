import { describe, expect, it } from "vitest";

import { extractVariableKeys } from "./generation-model";
import { newElement } from "../studio/model";

describe("generation-model", () => {
  it("extracts unique variable keys from text elements in a stable order", () => {
    const first = newElement("TEXT", 1);
    first.properties.text = "{{cliente_nombre}} / {{FECHA}}";
    const second = newElement("TEXT", 2);
    second.properties.text = "{{cliente_nombre}}";

    expect(extractVariableKeys([first, second])).toEqual(["cliente_nombre", "fecha"]);
  });
});
