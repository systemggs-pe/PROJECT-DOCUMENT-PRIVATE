import type { StudioElement } from "@/features/studio/model";

export function extractVariableKeys(elements: StudioElement[]) {
  const keys = new Set<string>();
  for (const element of elements) {
    if (element.type !== "TEXT") continue;
    for (const match of element.properties.text.matchAll(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi)) keys.add(match[1]!.toLowerCase());
  }
  return [...keys].sort();
}
