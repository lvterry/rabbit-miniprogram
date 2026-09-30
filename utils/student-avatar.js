// Version 1: six shapes, high saturation, centered large eyes, transparent background.
function hashSeed(value) {
  let hash = 2166136261
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}
function avatarSvg(avatar) {
  let state = hashSeed(avatar.seed)
  const pick = count => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor(state / 4294967296 * count)
  }
  const hue = [146, 40, 3, 235, 188, 278][pick(6)]
  const shape = pick(6), expression = pick(3), offset = pick(3) - 1
const bodies=[
`<circle cx="50" cy="51" r="31"/>`,
`<rect x="20" y="21" width="60" height="60" rx="24"/>`,
`<path d="M50 20C57 20 61 26 66 35L80 61C86 73 79 82 67 82H33C21 82 14 73 20 61L34 35C39 26 43 20 50 20Z"/>`,
`<path d="M36 22H64Q69 22 72 27L85 48Q88 53 85 58L72 77Q69 82 64 82H36Q31 82 28 77L15 58Q12 53 15 48L28 27Q31 22 36 22Z"/>`,
`<rect x="15" y="29" width="70" height="47" rx="23.5"/>`,
`<path d="M50 20C63 20 82 44 82 58C82 75 68 84 50 84C32 84 18 75 18 58C18 44 37 20 50 20Z"/>`
];

  const left = 40 + offset, right = 60 + offset
  const eyes = expression === 1
    ? `<rect x="${left-4.8}" y="47.5" width="9.6" height="3" rx="1.5"/><rect x="${right-4.8}" y="47.5" width="9.6" height="3" rx="1.5"/>`
    : `<ellipse cx="${left}" cy="49" rx="4.8" ry="8.2"/><ellipse cx="${right}" cy="49" rx="4.8" ry="${expression === 2 ? 1.8 : 8.2}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 80 80"><g fill="hsl(${hue},62%,62%)">${bodies[shape]}</g><g fill="#fafff8">${eyes}</g></svg>`
}
function studentAvatar(student) {
  const avatar = student.avatar && student.avatar.style === 'geometric' && student.avatar.version === 1 && student.avatar.seed
    ? student.avatar : { style: 'geometric', version: 1, seed: student.id }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSvg(avatar))
}
module.exports = { avatarSvg, studentAvatar }
