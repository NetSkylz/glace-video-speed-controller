// Share the material between the video controller and the settings preview.
export function setGlassEffect(element: HTMLElement, strength: number): void {
  const amount = Math.min(1, Math.max(0, strength));
  element.style.setProperty('--glace-glass-background', `linear-gradient(145deg, rgb(255 255 255 / ${amount * 0.77}), rgb(255 255 255 / ${amount * 0.11}) 48%, rgb(255 255 255 / ${amount * 0.43}))`);
  element.style.setProperty('--glace-glass-filter', amount === 0 ? 'none' : `blur(${amount * 40}px) saturate(${1 + amount * 2.3})`);
}
