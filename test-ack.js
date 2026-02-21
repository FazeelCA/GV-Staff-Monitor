const http = require('http');
fetch('http://localhost:5000/api/messages/unread', {
    headers: { 'Authorization': 'Bearer ' } // wait, I need a token
})
