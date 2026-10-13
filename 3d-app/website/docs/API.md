# 3DEEZI web and mobile API

The Laravel backend serves JSON at `/api/v1`. The React website uses these endpoints, and native clients can use the same bearer-token contract. The existing Flutter application remains unchanged; connect its screens and controller to this API explicitly.

Local base URLs:

| Client | Base URL |
| --- | --- |
| Website / desktop with `artisan serve` | `http://127.0.0.1:8000/api/v1` |
| Android emulator connecting to the host | `http://10.0.2.2:8000/api/v1` |
| Local XAMPP subfolder | `http://localhost/3d-app/website/public/api/v1` |
| Physical phone | `http://<development-computer-LAN-IP>:8000/api/v1` |

For a physical phone, both devices need network connectivity to the server; bind the development server to the LAN interface and allow the development port through the local firewall. A phone's `localhost` points to the phone. Use HTTPS for a hosted deployment. Browser clients on another origin must be included in the comma-separated `CORS_ALLOWED_ORIGINS` environment setting; native mobile clients are not governed by browser CORS.

Send `Accept: application/json` on every request. For JSON request bodies also send `Content-Type: application/json`. Successful JSON responses use `{"data": ...}`. Image downloads and project export downloads return the file directly, without a `data` wrapper. Timestamps are ISO date strings.

## Authentication

Laravel Sanctum issues a bearer token on registration or login. Each issued token expires after 30 days. Save it in secure platform storage on a mobile client and send it in the `Authorization` header. The website keeps its token in session storage. Logout revokes the current token; logging out of one device does not revoke other devices' tokens. There is no refresh-token endpoint.

```http
POST /api/v1/auth/register
Accept: application/json
Content-Type: application/json

{
  "name": "Alex Morgan",
  "email": "alex@example.com",
  "password": "replace-with-a-strong-password",
  "password_confirmation": "replace-with-a-strong-password",
  "device_name": "Android app"
}
```

Registration returns HTTP 201. Login uses the same fields except `name` and `password_confirmation` and returns HTTP 200:

```http
POST /api/v1/auth/login
Accept: application/json
Content-Type: application/json

{
  "email": "alex@example.com",
  "password": "replace-with-a-strong-password",
  "device_name": "Android app"
}
```

Both return this shape:

```json
{
  "data": {
    "user": { "id": 1, "name": "Alex Morgan", "email": "alex@example.com" },
    "token": "<opaque-sanctum-token>",
    "token_type": "Bearer",
    "expires_at": "<ISO-8601-expiration>"
  }
}
```

Treat the token as opaque; the API returns it only when issuing it. All endpoints below except the catalog, login and registration require:

```http
Authorization: Bearer <opaque-sanctum-token>
```

| Method | Endpoint | Request / response |
| --- | --- | --- |
| POST | `/auth/register` | Required name (up to 100 characters), unique email, password (at least 8 characters), matching password confirmation. Optional device name up to 100 characters. |
| POST | `/auth/login` | Email and password; optional device name. Returns user and a new token. |
| GET | `/auth/me` | Current user. |
| PATCH | `/auth/me` | `{"name":"Updated name"}`; updates the display name and returns the user. |
| POST | `/auth/logout` | Revokes the current token and returns a message. |

Password recovery, email verification, Apple sign-in and Google sign-in are not implemented.

## Catalog and concepts

`GET /catalog` is public. It returns `sports`, `garments` and `provider`. Use IDs from this response as API values; the display names are for the interface.

Sports are `rugby-league`, `rugby-union`, `football`, `basketball`, `netball`, `afl`, `hockey` and `training`. Garments are `jersey`, `shorts`, `tee`, `singlet`, `polo` and `fullkit`.

```http
POST /api/v1/concepts
Authorization: Bearer <opaque-sanctum-token>
Accept: application/json
Content-Type: application/json

{
  "prompt": "Black and cyan rugby jersey with bold chevron patterns",
  "sport": "rugby-league",
  "garment": "jersey",
  "colors": ["#09121E", "#04D9E8", "#7757FF"]
}
```

The prompt must contain 8–1500 characters. `colors` is optional and accepts one to three six-digit hex colors. Optional `reference_ids` accepts up to six distinct asset IDs belonging to the current user. The response is `{"data":{"provider":{...},"concepts":[...],"reference_ids":[],"reference_images_analyzed":false}}`. Each concept contains `id`, `name`, `description` and an editable `design` object. A concept ID identifies a generated variation; it is not a saved project ID. Save the chosen variation using `POST /projects`.

The current provider is `procedural` with `is_ai: false`. It interprets supported color and pattern keywords and returns four variations. It does not perform generative AI, visual reference-image analysis or an external model request. Clients should display the provider information rather than imply an AI service is connected.

## Projects, versions and dashboard

All project access is scoped to the authenticated user. Another account's project returns 404. New projects start at version 1 and create an initial snapshot.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/projects` | Lists the user's projects, most recently updated first. Optional `status=draft|approved`, `mode=ai|dyo`, and `search` (name search, up to 120 characters). Returns an array; pagination is not implemented. |
| POST | `/projects` | Creates a project and returns HTTP 201. |
| GET | `/projects/{id}` | Returns one project. |
| PATCH / PUT | `/projects/{id}` | Updates provided fields; returns the current project. |
| DELETE | `/projects/{id}` | Deletes the project and its version history; returns a message. |
| GET | `/projects/{id}/versions` | Returns snapshots, latest first, with `id`, `name`, `design`, `version` and `created_at`. |
| GET | `/projects/{id}/export` | Downloads JSON by default; `?format=svg` returns a flat schematic. |
| GET | `/dashboard` | Returns project, draft, approved and asset counts, plus up to six `recent_projects`. |

Example project creation:

```http
POST /api/v1/projects
Authorization: Bearer <opaque-sanctum-token>
Accept: application/json
Content-Type: application/json

{
  "name": "Rugby home kit",
  "sport": "rugby-league",
  "garment": "jersey",
  "mode": "dyo",
  "status": "draft",
  "design": {
    "garment": "jersey",
    "main": "#09121E",
    "secondary": "#04D9E8",
    "accent": "#7757FF",
    "pattern": "Chevron",
    "logoText": "3DEEZI",
    "backName": "MORGAN",
    "number": "23",
    "patternColor": "#0B6F78",
    "patternBody": 0.06,
    "patternScale": 0.3,
    "logoImage": null,
    "patternImage": null
  }
}
```

Required creation fields: `name` (up to 120 characters), `sport`, `garment` and `design`. Optional `mode` defaults to `dyo`; optional `status` defaults to `draft`. A returned project includes those fields plus `id`, `version`, `created_at` and `updated_at`.

The design requires `main`, `secondary`, `accent` and `pattern`. Supported patterns are exactly `Solid`, `Stripes`, `Chevron` and `Velocity`. Colors use `#RRGGBB`. Optional `logoText` and `backName` allow up to 40 characters; `number` is a string of up to three characters. `patternBody` is an opacity between 0 and 1; `patternScale` is a number from 0.1 to 10. `prompt` can store up to 1500 characters. The server keeps `design.garment` consistent with the project garment.

When updating, omit unchanged top-level fields. If you provide `design`, send the complete desired design object: it replaces the stored object rather than merging individual properties. Include `expected_version` from the last fetched project to detect simultaneous edits:

```http
PATCH /api/v1/projects/42
Authorization: Bearer <opaque-sanctum-token>
Accept: application/json
Content-Type: application/json

{"name":"Rugby away kit","expected_version":1}
```

A mismatched `expected_version` returns 409. Fetch the latest project, reconcile changes, then save with its version. A changed project increments its version and saves a snapshot; an unchanged update does not create a duplicate version. Snapshots contain the name and design, not an independent copy of all project metadata. To restore a design, fetch the desired snapshot and PATCH its design onto the current project with the current `expected_version`.

`approved` is a user-managed project status. It does not represent manufacturer acceptance, a separate administrator permission, or a production-readiness check.

## Asset uploads and private files

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/assets` | Lists the current user's uploaded assets, newest first. |
| POST | `/assets` | Multipart upload; returns HTTP 201 with asset metadata. |
| GET | `/assets/{id}/file` | Returns the original image, authenticated and scoped to its owner. |
| DELETE | `/assets/{id}` | Deletes the stored file and metadata; returns a message. |

Upload fields are `file`, required `type` (`logo`, `pattern`, `artwork` or `reference`), and optional `name` (up to 120 characters). Allowed files are PNG, JPEG and WebP, up to 10 MiB, with dimensions no larger than 8192 × 8192. SVG is not accepted. Ensure PHP's `upload_max_filesize` and `post_max_size` allow the intended request size; Apache's PHP settings can differ from command-line PHP.

For example, with curl (use `curl.exe` in Windows PowerShell):

```sh
curl -X POST "http://127.0.0.1:8000/api/v1/assets" -H "Accept: application/json" -H "Authorization: Bearer <token>" -F "type=logo" -F "name=Team crest" -F "file=@crest.png"
```

Do not manually set a multipart `Content-Type`; the HTTP client must include its generated boundary. Asset metadata includes `id`, `name`, `type`, `mime_type`, `size`, `created_at` and `url`. Files are private on Laravel's local disk, with authenticated download routes; there is no requirement to create a public storage symlink.

An asset's `url` still requires an Authorization header. A browser `<img src>` or the embedded viewer cannot attach that bearer header automatically. Fetch the file with authentication, then use a Blob URL for display or a raster data URL for the saved design's `logoImage` / `patternImage`. The design image fields accept nullable local URLs, same-origin URLs, and PNG/JPEG/WebP base64 data URLs, each up to 1,500,000 characters. Resize large uploaded artwork before embedding it into a design. Do not persist temporary Blob URLs; they expire when the document closes.

## Export contract

`GET /projects/{id}/export` sends an attachment named `3deezi-project-{id}-v{version}.json`:

```json
{
  "format": "3deezi-design",
  "schema_version": 1,
  "project": { "id": 42, "name": "Rugby home kit", "version": 1, "design": {} }
}
```

The `project` above is abbreviated; the response contains the full saved project. Download it with an authenticated request. Export reflects the saved version, so save pending edits first. There is no dedicated import endpoint; validate an imported design on the client and create a new project through the normal project endpoint if adding that feature.

`GET /projects/{id}/export?format=svg` downloads an SVG flat schematic with the kit's colors, supported procedural pattern and text. It does not include raster logo or pattern-image decals, and is not a render of the 3D model. `?format=json` explicitly selects the default JSON export. Other formats return a validation error.

PNG mockups come from the client's actual 3D viewer. The React component exposes `capture('front' | 'side' | 'back')`, returning a PNG data URL after design updates finish. The Flutter renderer has its existing capture bridge. There is no server-side screenshot endpoint. These outputs are presentation mockups and editable design data, not production cut patterns, graded templates or manufacturing tech packs.

## Flutter request example

This example uses Dart's `http` package. Add it to the mobile application's dependencies when integrating; it is not wired into the current static screens by this website change.

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

const apiBase = 'http://10.0.2.2:8000/api/v1'; // Android emulator

Future<Map<String, dynamic>> login(String email, String password) async {
  final response = await http.post(
    Uri.parse('$apiBase/auth/login'),
    headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
    body: jsonEncode({
      'email': email,
      'password': password,
      'device_name': 'Flutter app',
    }),
  );
  final body = jsonDecode(response.body) as Map<String, dynamic>;
  if (response.statusCode != 200) {
    throw Exception(body['message'] ?? 'Sign-in failed');
  }
  return body['data'] as Map<String, dynamic>;
  // Store data['token'] using secure platform storage.
}

Future<List<dynamic>> loadProjects(String token) async {
  final response = await http.get(
    Uri.parse('$apiBase/projects'),
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    },
  );
  if (response.statusCode == 401) {
    throw Exception('Your session expired. Sign in again.');
  }
  final body = jsonDecode(response.body) as Map<String, dynamic>;
  if (response.statusCode != 200) {
    throw Exception(body['message'] ?? 'Projects could not be loaded');
  }
  return body['data'] as List<dynamic>;
}
```

Map the Flutter controller's colors to six-digit hex strings and its garment names to catalog IDs (`Training Tee` → `tee`, `Full Kit` → `fullkit`). Keep the backend project ID and current version with the active editor state; send the current full design on save, then replace the local version with the returned value. Load the saved design into the existing Three.js bridge when reopening a project.

## Errors and rate limits

Validation errors return HTTP 422:

```json
{
  "message": "The given data was invalid.",
  "errors": { "name": ["The name field is required."] }
}
```

The exact human-readable message can vary. Use HTTP status and field-keyed `errors` to drive the interface.

| Status | Client action |
| --- | --- |
| 401 | Missing, expired or revoked token; request sign-in. |
| 404 | Resource is absent or belongs to another account. |
| 409 | Project version conflict; reload and reconcile. |
| 422 | Show field validation errors; invalid login credentials also use this status. |
| 429 | Rate limit reached; respect `Retry-After`. |
| 5xx | Report a server failure and offer retry without assuming the write succeeded. |

Limits are 120 API requests per minute, login/registration at 8 per IP and 5 per email/IP per minute, 20 uploads per user per minute, and 12 concept requests per user per minute. These are defined in `app/Providers/AppServiceProvider.php`. The authoritative request and response definitions are `routes/api.php`, `app/Http/Controllers/` and `app/Http/Requests/ProjectRequest.php`.
