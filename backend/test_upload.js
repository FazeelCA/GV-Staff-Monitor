
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function test() {
    try {
        // 1. Login to get token
        const login = await axios.post('http://localhost:4000/api/auth/login', {
            email: 'admin@example.com', // Assuming default admin or I need to know a user
            password: 'password123'
        });
        const { token, user } = login.data;
        console.log('Login success, token:', token.substring(0, 10) + '...');

        // 2. Create dummy image
        fs.writeFileSync('test.jpg', 'dummy content');

        // 3. Upload
        const form = new FormData();
        form.append('image', fs.createReadStream('test.jpg'));
        form.append('userId', user.id);
        form.append('task', 'Test Task');

        const upload = await axios.post('http://localhost:4000/api/screenshots/upload', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Upload status:', upload.status);
        console.log('Upload data:', upload.data);

    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}
test();
