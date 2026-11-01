export function sceneText(value: string, length = 24) {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim());
  return (chars.length > length ? chars.slice(0, length - 1).join('') + '…' : chars.join('')).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
