async function test() {
  const res = await fetch('http://localhost:3000/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello world', language: 'en' })
  });
  console.log(res.status, res.headers.get('content-type'));
  const text = await res.text();
  console.log(text.substring(0, 100));
}
test();
