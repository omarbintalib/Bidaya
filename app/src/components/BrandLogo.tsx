import type { SVGProps } from 'react';

// Original supplied geometry, normalized by translating its drawing origin.
// Header, loading strokes, cover and reveal aperture all share this one source.
export const LOGO = { width: 1407, height: 587, cx: 703.5, cy: 293.5 };

export function LogoGeometry() {
  return <g transform="translate(-5060 -1127)" fill="currentColor">
      <g data-logo-stroke="0"><path d="M6463 1253 6463 1595 6360 1595 6360 1350.61Z" fillRule="evenodd" /></g>
      <g data-logo-stroke="1"><rect x="5846" y="1492" width="565" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="2"><rect x="6360" y="1611" width="103" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="3"><path d="M5977.01 1248.64 6120.9 1524.47 6029.78 1572 5899.5 1322.26Z" fillRule="evenodd" /></g>
      <g data-logo-stroke="4"><path d="M5812.2 1252 5813 1252 5813 1595 5710 1595 5710 1346.75 5710.15 1348.69Z" fillRule="evenodd" /></g>
      <g data-logo-stroke="5"><path d="M5674.68 1252 5677 1252 5677 1595 5574 1595 5574 1347.39Z" fillRule="evenodd" /></g>
      <g data-logo-stroke="6"><rect x="5060" y="1492" width="565" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="7"><rect x="5266" y="1252" width="102" height="312" fillRule="evenodd" /></g>
      <g data-logo-stroke="8"><path d="M5163 1258 5163 1595 5060 1595 5060 1348.25Z" fillRule="evenodd" /></g>
      <g data-logo-stroke="9"><path d="M5169.11 1252 5368 1252 5368 1354 5060 1354 5060 1347.07Z" fillRule="evenodd" /></g>
      <g data-logo-stroke="10"><rect x="5060" y="1132" width="308" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="11"><rect x="5430" y="1611" width="247" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="12"><rect x="5060" y="1611" width="340" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="13"><rect x="5710" y="1611" width="626" height="103" fillRule="evenodd" /></g>
      <g data-logo-stroke="14"><rect x="5400" y="1131" width="1063" height="103" fillRule="evenodd" /></g>
  </g>;
}

export default function BrandLogo(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 1407 587" {...props}><LogoGeometry /></svg>;
}
