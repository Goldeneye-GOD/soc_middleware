# Frontend Integration Guide

This document explains how the frontend app should connect to the Society Manager middleware API and how the `superAdmin` flow works.

---

## 1. Base URL

Use the Worker URL from Cloudflare after deployment.

Example:

```text
https://society-manager-api.<your-subdomain>.workers.dev
```

For local development:

```text
http://localhost:8787
```

---

## 2. Authentication flow

All protected endpoints require a Bearer token in the Authorization header.

### Sign up

Request:

```http
POST /api/auth/signup
Content-Type: application/json
```

Body:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "secret123"
}
```

Success response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "abc123"
}
```

### Login

Request:

```http
POST /api/auth/login
Content-Type: application/json
```

Body:

```json
{
  "email": "john@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "abc123"
}
```

### Save the token on the frontend

Store the returned token locally and send it with every protected call:

```http
Authorization: Bearer <token>
```

---

## 3. Society creation and super admin assignment

This is the most important part for the frontend.

### Endpoint

```http
POST /api/societies
Authorization: Bearer <token>
```

### Request body

```json
{
  "name": "Green Valley Society",
  "address": "Main Road, Bengaluru"
}
```

### Backend behavior

When the logged-in user creates a society, the API does all of this automatically:

1. Creates a new society row
2. Creates a membership row in `members`
3. Sets the user as:
   - `role = "superAdmin"`
   - `status = "approved"`

This means the user who creates the society immediately becomes the society super admin.

### Response

```json
{
  "id": "soc_123"
}
```

### Frontend flow

The app should do the following when the user wants to create a society:

1. User signs up or logs in
2. Frontend stores the JWT token
3. Frontend calls `POST /api/societies`
4. API creates the society and assigns the current user as super admin
5. Frontend redirects to the newly created society dashboard

---

## 4. How to add admins to a society

Only an approved `superAdmin` or `admin` can add members.

### Endpoint

```http
POST /api/members
Authorization: Bearer <token>
```

### Body

```json
{
  "societyId": "soc_123",
  "userId": "user_456",
  "role": "admin",
  "status": "pending",
  "unitId": null,
  "relation": null
}
```

### Role values

```text
superAdmin
admin
resident
security
```

### Status values

```text
pending
approved
rejected
suspended
```

### Important rule

A user is not automatically allowed to access another society unless they have a proper membership record there.

---

## 5. Fetching society data

### List societies for current user

```http
GET /api/societies
Authorization: Bearer <token>
```

This returns the list of societies for which the user has an approved membership.

### Get one society

```http
GET /api/societies/:id
Authorization: Bearer <token>
```

---

## 6. Access control model

The frontend should treat access like this:

- `superAdmin`: full control of the society
- `admin`: can manage members, rules, units, complaints, notices, etc.
- `resident`: limited to their own unit and relevant resident actions
- `security`: allowed to handle visitor and incident workflows

A user should only see a society in the app if they have an approved membership row in that society.

---

## 7. Frontend request pattern

Use this pattern in all protected requests:

```js
const token = localStorage.getItem('jwt');

const response = await fetch('http://localhost:8787/api/societies', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
});
```

### Example login + create society flow

```js
async function signupAndCreateSociety() {
  const signupRes = await fetch('http://localhost:8787/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9876543210',
      password: 'secret123'
    })
  });

  const signupData = await signupRes.json();
  localStorage.setItem('jwt', signupData.token);

  const societyRes = await fetch('http://localhost:8787/api/societies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${signupData.token}`
    },
    body: JSON.stringify({
      name: 'Green Valley Society',
      address: 'Main Road, Bengaluru'
    })
  });

  const societyData = await societyRes.json();
  return societyData;
}
```

---

## 8. Flutter example

If the frontend is Flutter, this is the recommended pattern.

### Login

```dart
final response = await http.post(
  Uri.parse('http://localhost:8787/api/auth/login'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'email': 'john@example.com',
    'password': 'secret123',
  }),
);

if (response.statusCode == 200) {
  final data = jsonDecode(response.body);
  final token = data['token'];
  // save token in secure storage
}
```

### Create society

```dart
final token = await storage.read(key: 'jwt');

final response = await http.post(
  Uri.parse('http://localhost:8787/api/societies'),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
  },
  body: jsonEncode({
    'name': 'Green Valley Society',
    'address': 'Main Road, Bengaluru',
  }),
);

if (response.statusCode == 201) {
  final data = jsonDecode(response.body);
  print(data['id']);
}
```

---

## 9. Error handling on frontend

The API uses standard JSON errors:

```json
{ "error": "Forbidden" }
```

Typical cases:

- 400: missing or invalid input
- 401: token missing or invalid
- 403: logged in user is not allowed in this society
- 404: resource not found
- 409: duplicate email or conflict
- 500: server error

Frontend should show a friendly message for each case and redirect the user to login when they get 401.

---

## 10. Recommended frontend state

On login or app startup, the app should load:

- current user profile
- list of approved societies for this user
- active society selected by the user
- current role for the selected society

This is important because access is always checked against the selected society and the logged-in user’s membership row.

---

## 11. Super admin method summary

The frontend should treat the creator of a society as the first `superAdmin` automatically.

That means:

- On first user creation, there is no society yet
- On society creation, the current user becomes `superAdmin`
- The frontend should show a “Create Society” flow for first-time users
- After that, the super admin can add users as `admin`, `resident`, or `security`

This is the correct method to support multiple societies and per-society access control.

---

## 12. Recommended user journey

1. User signs up
2. User logs in
3. User creates first society
4. Backend assigns current user as `superAdmin`
5. User adds admins and residents to the society
6. User switches between societies from the dashboard
7. Each society keeps its own membership and permissions

---

## 13. Final note

The backend is already designed to support multiple societies per user, with separate membership permissions per society.

The frontend should always:

- include the JWT token on protected requests
- call `/api/societies` for society switch/listing
- respect the selected society and current member role
- never assume one admin can access another society without membership

If you want, I can also create a second doc specifically for Flutter app screens and API call classes, or generate the actual API service layer code for the frontend app.
