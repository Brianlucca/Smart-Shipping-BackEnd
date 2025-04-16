# File Upload and Session Management API

### Description
This project is a file upload API that allows users to upload files, retrieve them through a unique session URL, and download them with an expiration time. The files are stored on Cloudinary, and the sessions are managed with unique session IDs. The files will expire and be automatically deleted after a set period.

### Features
Upload files (images, videos, PDFs, and other file types).

Each upload is associated with a unique session ID.

Files can be accessed through a session URL.

Files expire after a certain period and are automatically deleted.

Session data is managed using cookies to maintain the user’s session.

Cloudinary integration for file storage.

### Requirements
Node.js

npm or yarn

Cloudinary account

### Installation

Clone this repository:

```
https://github.com/Brianlucca/Smart-Shipping-BackEnd.git
````
Install dependencies:
````
npm install
`````
Create a .env file in the root of the project and add your Cloudinary credentials:

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
````
Start the server:
```
node server.js
````
### Usage
#### File Upload
To upload files, you can use the following API endpoint:

* POST /upload/:sessionId

Where :sessionId is a unique session identifier. You can retrieve this session ID by visiting the /session-url endpoint.

#### Session URL
To get the session URL, send a GET request to the following endpoint:

* GET /session-url

It will return a URL like:
```
{
  "url": "http://localhost:3000/sessionId"
}
````
You can visit this URL to view and download the files uploaded to the session.

### Expiration and Cleanup
Files uploaded to a session will expire after 5 minutes. After this period, they will be automatically deleted from Cloudinary.

### API Documentation
POST /upload/:sessionId: Uploads files to a session.

GET /session-url: Retrieves a URL for the session.

GET /:sessionId: Retrieves the files associated with the session.

### Front End
<a href="https://github.com/Brianlucca/Smart-Shipping" target="_blank">Smart Shipping</a>

