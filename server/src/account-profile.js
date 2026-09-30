function accountProfile({ id, phoneNumber = '', createdAt }) {
  const phoneMasked = phoneNumber.length >= 8
    ? `${phoneNumber.slice(0, 3)}${'*'.repeat(phoneNumber.length - 7)}${phoneNumber.slice(-4)}` : ''
  return { id, loggedIn: !!phoneNumber, phoneMasked, createdAt }
}
module.exports = { accountProfile }
