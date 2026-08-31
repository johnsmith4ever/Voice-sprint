const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=hello&tl=en&client=tw-ob`
const res = await fetch(url)
console.log(res.status)
const text = await res.text()
console.log(text.substring(0, 100))
