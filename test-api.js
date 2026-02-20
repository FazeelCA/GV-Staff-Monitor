const token = process.argv[2];
fetch("https://track.gallerydigital.in/api/tasks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({ title: "Test task via script" })
}).then(r => r.text()).then(t => console.log(t)).catch(console.error);
