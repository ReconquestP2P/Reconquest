export const reconquestLogoSVG = `
<svg width="250" height="150" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
  <!-- Bitcoin Symbol Circle -->
  <circle cx="120" cy="120" r="60" fill="none" stroke="#1e40af" stroke-width="8"/>
  
  <!-- Bitcoin B -->
  <text x="120" y="135" font-family="Arial, sans-serif" font-size="40" font-weight="bold" text-anchor="middle" fill="#1e40af">₿</text>
  
  <!-- King Crown -->
  <g transform="translate(250, 60)">
    <!-- Crown base -->
    <ellipse cx="0" cy="80" rx="50" ry="8" fill="#D4AF37"/>
    <!-- Crown points -->
    <polygon points="-40,20 -20,0 0,15 20,0 40,20 40,80 -40,80" fill="#D4AF37" stroke="#B8860B" stroke-width="2"/>
    <!-- Crown jewels -->
    <circle cx="-20" cy="40" r="4" fill="#FF6B6B"/>
    <circle cx="0" cy="30" r="5" fill="#4ECDC4"/>
    <circle cx="20" cy="40" r="4" fill="#FF6B6B"/>
  </g>
  
  <!-- King Head -->
  <g transform="translate(250, 120)">
    <!-- Face -->
    <ellipse cx="0" cy="0" rx="25" ry="30" fill="#F4C2A1"/>
    <!-- Eyes -->
    <circle cx="-8" cy="-10" r="2" fill="#333"/>
    <circle cx="8" cy="-10" r="2" fill="#333"/>
    <!-- Nose -->
    <path d="M0,-5 L2,0 L0,2 L-2,0 Z" fill="#E6A373"/>
    <!-- Mouth -->
    <path d="M-5,8 Q0,12 5,8" stroke="#333" fill="none" stroke-width="1"/>
    <!-- Beard -->
    <path d="M-15,15 Q0,35 15,15" fill="#D4AF37" stroke="#B8860B" stroke-width="1"/>
  </g>
  
  <!-- Company Name -->
  <text x="200" y="200" font-family="serif" font-size="36" font-weight="bold" text-anchor="middle" fill="#1a1a1a">Reconquest</text>
</svg>
`.trim();

export const reconquestLogoDataURI = `data:image/svg+xml;base64,${Buffer.from(reconquestLogoSVG).toString('base64')}`;