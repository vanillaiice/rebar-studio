// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import { currentVersion, setTemplateAsset, templateAssetName, templateAssetProblem } from '../store/templates';
import { errorMessage } from '../components/format';

// Keep existing image references intact when another file has the same name.
function availableName(fileName: string, existing: string[]): string {
  const name = templateAssetName(fileName);
  const dot = name.lastIndexOf('.');
  let candidate = name;
  for (let suffix = 2; existing.includes(candidate); suffix++) {
    candidate = `${name.slice(0, dot)}-${suffix}${name.slice(dot)}`;
  }
  return candidate;
}

export async function addTemplateImages(templateId: string, files: File[], onError: (message: string) => void) {
  let version = await currentVersion(templateId);
  const names: string[] = [];
  for (const file of files) {
    const name = availableName(file.name, Object.keys(version.assets));
    const problem = templateAssetProblem(name, file.size, Object.keys(version.assets));
    if (problem) {
      onError(`${file.name}: ${problem}`);
      continue;
    }
    try {
      // The picker filters extensions; a drop can contain anything, including a renamed non-image.
      const bitmap = await createImageBitmap(file);
      bitmap.close();
    } catch {
      onError(`${file.name}: This file could not be read as an image.`);
      continue;
    }
    try {
      version = await setTemplateAsset(templateId, name, file);
      names.push(name);
    } catch (e) {
      onError(`${file.name}: ${errorMessage(e)}`);
    }
  }
  return { version, names };
}

export function templateImageTag(name: string): string {
  return `<img src="${name}" alt="" style="display: block; width: 320px; max-width: 100%; height: auto;">`;
}

export function canInsertTemplateImage(before: string): boolean {
  const insideTag = before.lastIndexOf('<') > before.lastIndexOf('>');
  const insideExpression = before.lastIndexOf('{{') > before.lastIndexOf('}}');
  const insideComment = before.lastIndexOf('<!--') > before.lastIndexOf('-->');
  // Ignore completed style/script elements; the remaining opener encloses this position.
  const withoutClosedElements = before.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const insideRawElement = /<(style|script)\b[^>]*>[\s\S]*$/i.test(withoutClosedElements);
  return !insideTag && !insideExpression && !insideComment && !insideRawElement;
}
