export function detectDeviceProfile() {
  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const touchCapable = "ontouchstart" in window && navigator.maxTouchPoints > 0;
  const isMobile = isMobileUA || touchCapable;

  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);

  const score = cores * 0.6 + mem * 0.8 - (ratio > 2 ? 1 : 0);
  let tier = "medium";
  if (score >= 9) tier = "high";
  else if (score <= 5) tier = "low";

  // Lighter particle budgets to speed up startup on lower tiers
  const presets = {
    high: { mainCount: 900, dustCount: 1200, photoCount: 12 },
    medium: { mainCount: 675, dustCount: 800, photoCount: 10 },
    low: { mainCount: 480, dustCount: 600, photoCount: 8 },
  };

  console.info("[Device]", { isMobile, cores, mem, ratio, tier });
  return { isMobile, tier, particles: presets[tier] };
}
