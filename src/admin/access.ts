const encodedAdminPassword = [98, 99, 110, 104, 111]

function decodePassword(encoded: number[]) {
  return encoded
    .map((codePoint, index) => String.fromCharCode(codePoint + (index % 2 === 0 ? -1 : 1)))
    .join('')
}

export function verifyAdminPassword(candidate: string) {
  return candidate === decodePassword(encodedAdminPassword)
}
