import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

/// The 3DEEZI server set at build time:
/// `--dart-define=API_BASE_URL=https://test.example.com`.
const _buildBaseUrl = String.fromEnvironment('API_BASE_URL');

/// The test server the apps use when no other is set at build time, so testers
/// never have to enter an address.
const testServerUrl = 'https://testcaresortwork.co.in/3deez';

class ApiException implements Exception {
  ApiException(this.message, {this.status});
  final String message;
  final int? status;

  bool get unauthorized => status == 401;

  @override
  String toString() => message;
}

@immutable
class ApiUser {
  const ApiUser({required this.id, required this.name, required this.email});

  factory ApiUser.fromJson(Map<String, dynamic> j) => ApiUser(
    id: j['id'] as int,
    name: j['name'] as String? ?? '',
    email: j['email'] as String? ?? '',
  );

  final int id;
  final String name, email;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email};
}

/// A 3DEEZI ASSIST answer: the text (light Markdown) and its commands.
@immutable
class AssistReply {
  const AssistReply(this.reply, this.actions);

  factory AssistReply.fromJson(Map<String, dynamic> j) =>
      AssistReply(j['reply'] as String? ?? '', [
        for (final a in (j['actions'] as List?) ?? const [])
          if (a is Map)
            ((a['action'] ?? '').toString(), (a['value'] ?? '').toString()),
      ]);

  final String reply;

  /// (action, value) pairs, for example ('grid', 'on').
  final List<(String, String)> actions;
}

/// The website's Laravel API (`/api/v1`, Sanctum bearer tokens): accounts
/// and the projects saved in its database.
class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      baseUrl = normalize(baseUrl ?? defaultBaseUrl);

  final http.Client _client;
  String baseUrl;
  String? token;

  /// The build-time server; a web build served by the website itself falls
  /// back to its own address.
  static String get defaultBaseUrl {
    if (_buildBaseUrl.isNotEmpty) return _buildBaseUrl;
    if (kIsWeb && (Uri.base.scheme == 'http' || Uri.base.scheme == 'https')) {
      return Uri.base.origin;
    }
    return testServerUrl;
  }

  bool get configured => baseUrl.isNotEmpty;

  /// The server's host for display, e.g. "test.3deezi.com".
  String get host => configured ? Uri.parse(baseUrl).authority : 'not set';

  /// "test.com/", "https://test.com/api/v1" and "https://test.com" all
  /// become "https://test.com".
  static String normalize(String url) {
    var u = url.trim();
    if (u.isEmpty) return '';
    if (!u.contains('://')) u = 'https://$u';
    u = u.replaceAll(RegExp(r'/+$'), '');
    if (u.endsWith('/api/v1')) u = u.substring(0, u.length - 7);
    return u.replaceAll(RegExp(r'/+$'), '');
  }

  // ---------- accounts
  Future<ApiUser> register({
    required String name,
    required String email,
    required String password,
    required String passwordConfirmation,
  }) => _signIn('/auth/register', {
    'name': name,
    'email': email,
    'password': password,
    'password_confirmation': passwordConfirmation,
  });

  Future<ApiUser> login({required String email, required String password}) =>
      _signIn('/auth/login', {'email': email, 'password': password});

  Future<ApiUser> _signIn(String path, Map<String, dynamic> body) async {
    final data = await _send(
      'POST',
      path,
      body: {
        ...body,
        'device_name': '3DEEZI ${kIsWeb ? 'web' : defaultTargetPlatform.name}',
      },
    );
    token = data['token'] as String;
    return ApiUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<ApiUser> me() async =>
      ApiUser.fromJson(await _send('GET', '/auth/me') as Map<String, dynamic>);

  /// Revokes the token on the server; signing out locally never fails.
  Future<void> logout() async {
    try {
      if (token != null) await _send('POST', '/auth/logout');
    } on ApiException {
      // Already expired or offline.
    } finally {
      token = null;
    }
  }

  // ---------- projects
  Future<List<Map<String, dynamic>>> projects() async =>
      (await _send('GET', '/projects') as List).cast<Map<String, dynamic>>();

  Future<Map<String, dynamic>> createProject(Map<String, dynamic> body) async =>
      await _send('POST', '/projects', body: body) as Map<String, dynamic>;

  Future<Map<String, dynamic>> updateProject(
    int id,
    Map<String, dynamic> body,
  ) async =>
      await _send('PATCH', '/projects/$id', body: body) as Map<String, dynamic>;

  Future<void> deleteProject(int id) => _send('DELETE', '/projects/$id');

  // ---------- orders and partners
  Future<List<Map<String, dynamic>>> orders() async =>
      (await _send('GET', '/orders') as List).cast<Map<String, dynamic>>();

  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> body) async =>
      await _send('POST', '/orders', body: body) as Map<String, dynamic>;

  /// 3DEEZI Orders: my orders by stage (`current` or `completed`), with a
  /// search by reference, name or garment, and my saved drafts.
  Future<Map<String, dynamic>> ordersBoard({
    String view = 'current',
    String search = '',
  }) async =>
      await _send(
            'GET',
            '/orders/board?view=$view'
                '${search.isEmpty ? '' : '&search=${Uri.encodeQueryComponent(search)}'}',
          )
          as Map<String, dynamic>;

  /// One of my orders: garments, files, design proofs, updates, tracking.
  Future<Map<String, dynamic>> order(int id) async =>
      await _send('GET', '/orders/$id') as Map<String, dynamic>;

  /// Approves the waiting design proof, or asks for changes (with a note).
  Future<Map<String, dynamic>> answerProof(
    int orderId, {
    required bool approve,
    int? proofId,
    String? message,
  }) async =>
      await _send(
            'POST',
            '/orders/$orderId/approval',
            body: {
              'decision': approve ? 'approve' : 'changes',
              'proof_id': proofId,
              'message': message,
            },
          )
          as Map<String, dynamic>;

  /// Notifications about my orders (approval needed, updates, shipped).
  Future<Map<String, dynamic>> notifications() async =>
      await _send('GET', '/notifications') as Map<String, dynamic>;

  Future<void> readNotifications() async {
    await _send('POST', '/notifications/read', body: const {});
  }

  /// The order forms' choices: garments, sports, fits, sizes (public).
  Future<Map<String, dynamic>> orderOptions() async =>
      await _send('GET', '/orders/options') as Map<String, dynamic>;

  /// "Help me add sizes": garment rows read from a plain description.
  Future<Map<String, dynamic>> orderAssist(String text) async =>
      await _send('POST', '/orders/assist', body: {'text': text})
          as Map<String, dynamic>;

  /// A saved, not submitted order form or upload (kind `form` / `upload`).
  Future<Map<String, dynamic>> createOrderDraft(
    String kind,
    Map<String, dynamic> data,
  ) async =>
      await _send('POST', '/order-drafts', body: {'kind': kind, 'data': data})
          as Map<String, dynamic>;

  Future<Map<String, dynamic>> saveOrderDraft(
    int id,
    Map<String, dynamic> data,
  ) async =>
      await _send('PATCH', '/order-drafts/$id', body: {'data': data})
          as Map<String, dynamic>;

  Future<void> removeOrderDraftFile(int draftId, int fileId) async {
    await _send('DELETE', '/order-drafts/$draftId/files/$fileId');
  }

  /// Submits a draft as one order; the same [key] again (a retry) gives the
  /// same order, never a second one.
  Future<Map<String, dynamic>> submitOrderDraft(
    int id,
    String key,
    Map<String, dynamic> fields,
  ) async =>
      await _send(
            'POST',
            '/order-drafts/$id/submit',
            body: fields,
            headers: {'Idempotency-Key': key},
          )
          as Map<String, dynamic>;

  /// Uploads an order form or artwork file to a draft, reporting progress
  /// (0..1) as the bytes go out.
  Future<Map<String, dynamic>> uploadOrderFile(
    int draftId,
    Uint8List bytes, {
    required String filename,
    required String kind,
    void Function(double sent)? onProgress,
  }) async {
    if (!configured) {
      throw ApiException('No 3DEEZI server is set. Add it under Server.');
    }
    final multipart =
        http.MultipartRequest(
            'POST',
            Uri.parse('$baseUrl/api/v1/order-drafts/$draftId/files'),
          )
          ..fields['kind'] = kind
          ..files.add(
            http.MultipartFile.fromBytes('file', bytes, filename: filename),
          );
    final total = multipart.contentLength;
    var sent = 0;
    final body = multipart.finalize().map((chunk) {
      sent += chunk.length;
      onProgress?.call(total == 0 ? 1 : (sent / total).clamp(0, 1).toDouble());
      return chunk;
    });
    final request =
        http.StreamedRequest(
            'POST',
            Uri.parse('$baseUrl/api/v1/order-drafts/$draftId/files'),
          )
          ..contentLength = total
          ..headers.addAll({
            ...multipart.headers,
            'Accept': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          });
    body.listen(
      request.sink.add,
      onDone: request.sink.close,
      onError: request.sink.addError,
    );
    return await _receive(
          () => _client.send(request),
          long: true,
          sent: bytes.length,
        )
        as Map<String, dynamic>;
  }

  /// The price choices offered (payments): destinations, extras, discount codes (public).
  Future<Map<String, dynamic>> pricingOptions() async =>
      await _send('GET', '/pricing/options') as Map<String, dynamic>;

  /// The review step's price (payments): a quote for these order fields.
  Future<Map<String, dynamic>> pricingQuote(Map<String, dynamic> body) async =>
      await _send('POST', '/pricing/quote', body: body) as Map<String, dynamic>;

  /// A 2-hour link to pay an invoice (no sign-in needed on the pay page).
  Future<String> invoicePayLink(String number) async =>
      '${(await _send('POST', '/invoices/${Uri.encodeComponent(number)}/link') as Map)['url']}';

  /// A file kept with one of my orders (an order form, artwork, a proof).
  Future<Uint8List> downloadOrderFile(int id) async {
    final request = http.Request('GET', Uri.parse('$baseUrl/api/v1/order-files/$id'))
      ..headers.addAll({if (token != null) 'Authorization': 'Bearer $token'});
    final response = await http.Response.fromStream(await _client.send(request));
    if (response.statusCode != 200) {
      throw ApiException('That file could not be downloaded.', status: response.statusCode);
    }
    return response.bodyBytes;
  }

  /// A website page, opened signed in: the token goes in the address's
  /// #fragment, which browsers never send to a server.
  String sitePage(String path) =>
      '$baseUrl$path${token == null ? '' : '#app-token=${Uri.encodeComponent(token!)}'}';

  /// 3DEEZI ASSIST, the help chat (no account needed): the answer to the
  /// last question in [messages] and, when [can] includes `commands`, the
  /// commands for the app to run (show the grid, pick a tool, …).
  Future<AssistReply> assist(
    List<Map<String, String>> messages, {
    String? page,
    List<String> can = const [],
    String? context,
  }) async {
    final data = await _send(
      'POST',
      '/assist',
      body: {
        'messages': messages,
        if (page != null) 'page': page,
        'can': can,
        'client': 'app',
        if (context != null) 'context': context,
      },
    );
    return AssistReply.fromJson(data as Map<String, dynamic>);
  }

  /// Corporate Partner application (no account needed). Returns the reply.
  Future<String> applyPartner(Map<String, dynamic> body) async {
    final data = await _send('POST', '/partners/apply', body: body);
    return (data as Map?)?['message'] as String? ?? 'Application sent.';
  }

  // ---------- saved assets
  /// Keeps a file with the user's saved assets (`POST /assets`, multipart);
  /// answers its id.
  Future<int> uploadAsset(
    Uint8List bytes, {
    required String filename,
    required String type,
    required String contentType,
  }) async {
    if (!configured) {
      throw ApiException('No 3DEEZI server is set. Add it under Server.');
    }
    final parts = contentType.split('/');
    final request =
        http.MultipartRequest('POST', Uri.parse('$baseUrl/api/v1/assets'))
          ..headers.addAll({
            'Accept': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          })
          ..fields['type'] = type
          ..fields['name'] = filename.length > 120
              ? filename.substring(0, 120)
              : filename
          ..files.add(
            http.MultipartFile.fromBytes(
              'file',
              bytes,
              filename: filename,
              contentType: MediaType(parts.first, parts.last),
            ),
          );
    final data = await _receive(
      () => _client.send(request),
      long: true,
      sent: bytes.length,
    );
    final id = (data as Map?)?['id'];
    if (id is! int) {
      throw ApiException('The server did not keep the file. Please try again.');
    }
    return id;
  }

  Future<void> deleteAsset(int id) => _send('DELETE', '/assets/$id');

  // ---------- Artboard designs and templates (the Artboard's File menu)
  /// The account's Artboard designs or, with [template], its templates
  /// (newest first), without their contents.
  Future<List<Map<String, dynamic>>> artboards({bool template = false}) async =>
      (await _send('GET', '/artboards?template=${template ? 1 : 0}') as List)
          .cast<Map<String, dynamic>>();

  /// One Artboard design with its `document` (every page, as JSON text).
  Future<Map<String, dynamic>> artboard(int id) async =>
      await _send('GET', '/artboards/$id') as Map<String, dynamic>;

  /// Saves an Artboard design: a new one, or design [id] again. [version]
  /// is the one it was opened at (a newer one on the server answers 409).
  Future<Map<String, dynamic>> saveArtboard({
    int? id,
    required String name,
    required String document,
    String? preview,
    bool template = false,
    int? version,
  }) async =>
      await _send(
            id == null ? 'POST' : 'PATCH',
            id == null ? '/artboards' : '/artboards/$id',
            body: {
              'name': name,
              'document': document,
              'preview': preview,
              'template': template,
              if (id != null && version != null) 'expected_version': version,
            },
            long: true,
          )
          as Map<String, dynamic>;

  Future<void> deleteArtboard(int id) => _send('DELETE', '/artboards/$id');

  // ---------- AI image edits (the image editor's "Describe edits")
  /// Whether AI is connected on the server (`GET /catalog`, no account
  /// needed).
  Future<bool> aiAvailable() async {
    final data = await _send('GET', '/catalog');
    return (data as Map?)?['provider']?['is_ai'] == true;
  }

  /// The picture changed as described (`POST /ai/image-edit`): [image] and
  /// the optional [mask] (see-through where the AI may change it) and
  /// [marked] copy are data URLs; [notes] are `{text, x, y}` with x and y
  /// from 0 to 1. Answers the new picture as a data URL.
  Future<String> editImage({
    required String image,
    String? instruction,
    String? mask,
    String? marked,
    List<Map<String, Object>> notes = const [],
    String? size,
  }) async {
    final data = await _send(
      'POST',
      '/ai/image-edit',
      body: {
        'image': image,
        if (instruction != null && instruction.trim().isNotEmpty)
          'instruction': instruction.trim(),
        if (notes.isNotEmpty) 'notes': notes,
        'mask': ?mask,
        'marked': ?marked,
        'size': ?size,
      },
      long: true,
    );
    final result = (data as Map?)?['image'];
    if (result is! String || !result.startsWith('data:image/')) {
      throw ApiException('No picture came back. Please try again.');
    }
    return result;
  }

  /// One saved asset's file (`GET /assets/{id}/file`) as a data URL.
  Future<String> assetDataUrl(int id) async {
    if (!configured) {
      throw ApiException('No 3DEEZI server is set. Add it under Server.');
    }
    final request =
        http.Request('GET', Uri.parse('$baseUrl/api/v1/assets/$id/file'))
          ..headers.addAll({
            'Accept': '*/*',
            if (token != null) 'Authorization': 'Bearer $token',
          });
    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await _client.send(request),
      ).timeout(const Duration(minutes: 3));
    } on TimeoutException {
      throw ApiException('The server at $host took too long to answer.');
    } on Object {
      throw ApiException(
        "Can't reach the 3DEEZI server at $host. Check the connection.",
      );
    }
    if (response.statusCode == 404) {
      throw ApiException(
        'The print layout file is no longer in the saved assets.',
        status: 404,
      );
    }
    if (response.statusCode != 200) {
      Object? json;
      try {
        json = jsonDecode(response.body);
      } on FormatException {
        json = null;
      }
      throw ApiException(
        _message(response.statusCode, json),
        status: response.statusCode,
      );
    }
    final type =
        (response.headers['content-type'] ?? 'application/octet-stream')
            .split(';')
            .first
            .trim();
    return 'data:$type;base64,${base64Encode(response.bodyBytes)}';
  }

  // ---------- 3DEEZI TEAM (human designers; T1's team-api.md)
  /// The sports and garments of the website's catalogue (`GET /catalog`):
  /// `{sports: [{id, name, group, garments}], garments: [{id, name}]}`.
  Future<Map<String, dynamic>> catalog() async =>
      await _send('GET', '/catalog') as Map<String, dynamic>;

  /// My plan, what is included this month and the next request's price.
  Future<Map<String, dynamic>> teamAllowance() async =>
      await _send('GET', '/team/allowance') as Map<String, dynamic>;

  /// My design requests, newest first.
  Future<List<Map<String, dynamic>>> teamRequests() async =>
      (await _send('GET', '/team/requests') as List)
          .cast<Map<String, dynamic>>();

  /// One request with its files, designs, messages and history (opening it
  /// marks the designer's messages read).
  Future<Map<String, dynamic>> teamRequest(int id) async =>
      await _send('GET', '/team/requests/$id') as Map<String, dynamic>;

  /// Sends a request: [fields] name, email, sport, garment, category,
  /// description, instructions; files under logos[] and references[].
  Future<Map<String, dynamic>> createTeamRequest(
    Map<String, String> fields, {
    List<String> colours = const [],
    List<({String name, Uint8List bytes})> logos = const [],
    List<({String name, Uint8List bytes})> references = const [],
    String? idempotencyKey,
  }) async =>
      await _teamMultipart(
            '/team/requests',
            {
              ...fields,
              if (idempotencyKey != null) 'idempotency_key': idempotencyKey,
            },
            lists: {'colours[]': colours},
            files: [
              for (final f in logos) ('logos[]', f),
              for (final f in references) ('references[]', f),
            ],
          )
          as Map<String, dynamic>;

  Future<Map<String, dynamic>> teamMessage(
    int id,
    String body, {
    List<({String name, Uint8List bytes})> files = const [],
  }) async =>
      await _teamMultipart(
            '/team/requests/$id/messages',
            {if (body.isNotEmpty) 'body': body},
            files: [for (final f in files) ('files[]', f)],
          )
          as Map<String, dynamic>;

  Future<Map<String, dynamic>> teamApprove(int id, {int? version}) async =>
      await _send(
            'POST',
            '/team/requests/$id/approve',
            body: {if (version != null) 'version': version},
          )
          as Map<String, dynamic>;

  /// [extra]: the included revisions are used up, so an extra round is
  /// invoiced (A$25 incl. GST) and starts once paid.
  Future<Map<String, dynamic>> teamRevise(
    int id,
    String message, {
    List<({String name, Uint8List bytes})> files = const [],
    bool extra = false,
  }) async =>
      await _teamMultipart(
            '/team/requests/$id/revisions',
            {'message': message, if (extra) 'extra': '1'},
            files: [for (final f in files) ('files[]', f)],
          )
          as Map<String, dynamic>;

  Future<Map<String, dynamic>> teamCancel(int id) async =>
      await _send('POST', '/team/requests/$id/cancel', body: const {})
          as Map<String, dynamic>;

  /// The approved design as an asset for the Studio's design picture.
  Future<Map<String, dynamic>> teamToStudio(int id) async =>
      await _send('POST', '/team/requests/$id/to-studio', body: const {})
          as Map<String, dynamic>;

  /// An order-form draft with the approved design: {draft_id, link}.
  Future<Map<String, dynamic>> teamOrderDraft(int id) async =>
      await _send('POST', '/team/requests/$id/order-draft', body: const {})
          as Map<String, dynamic>;

  /// A request's file ([url] is its API path, "/api/v1/team/files/9").
  Future<Uint8List> downloadTeamFile(String url) async {
    final path = url.replaceFirst(RegExp(r'^.*/api/v1'), '');
    final request = http.Request('GET', Uri.parse('$baseUrl/api/v1$path'))
      ..headers.addAll({if (token != null) 'Authorization': 'Bearer $token'});
    final response = await http.Response.fromStream(
      await _client.send(request),
    );
    if (response.statusCode != 200) {
      throw ApiException(
        'That file could not be downloaded.',
        status: response.statusCode,
      );
    }
    return response.bodyBytes;
  }

  Future<dynamic> _teamMultipart(
    String path,
    Map<String, String> fields, {
    Map<String, List<String>> lists = const {},
    List<(String, ({String name, Uint8List bytes}))> files = const [],
  }) {
    if (!configured) {
      throw ApiException('No 3DEEZI server is set. Add it under Server.');
    }
    final multipart =
        http.MultipartRequest('POST', Uri.parse('$baseUrl/api/v1$path'))
          ..fields.addAll(fields)
          ..headers.addAll({
            'Accept': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          });
    // Repeated fields (colours[]=navy&colours[]=#ffcc00) go in as parts too.
    for (final MapEntry(:key, :value) in lists.entries) {
      for (final v in value) {
        multipart.files.add(http.MultipartFile.fromString(key, v));
      }
    }
    var size = 0;
    for (final (field, f) in files) {
      size += f.bytes.length;
      multipart.files.add(
        http.MultipartFile.fromBytes(field, f.bytes, filename: f.name),
      );
    }
    return _receive(() => _client.send(multipart), long: true, sent: size);
  }

  // ---------- transport
  /// The largest request body sent (the website's limit too).
  static const maxBodyLength = 48 * 1024 * 1024;

  static const _tooLarge =
      'This design is too large to save. Remove or shrink large images in '
      'your artwork and try again.';

  /// Sends a request and returns the response's `data`. [long] waits up to
  /// five minutes (AI pictures).
  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool long = false,
    Map<String, String> headers = const {},
  }) async {
    if (!configured) {
      throw ApiException('No 3DEEZI server is set. Add it under Server.');
    }
    final encoded = body == null ? null : jsonEncode(body);
    // The server drops requests over its size limit without a clear answer:
    // catch oversized saves first, as the website does.
    if (encoded != null && encoded.length > maxBodyLength) {
      throw ApiException(_tooLarge, status: 413);
    }
    final request = http.Request(method, Uri.parse('$baseUrl/api/v1$path'))
      ..headers.addAll({
        'Accept': 'application/json',
        if (body != null) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
        ...headers,
      });
    if (encoded != null) request.body = encoded;
    return _receive(
      () => _client.send(request),
      sent: encoded?.length ?? 0,
      long: long,
    );
  }

  /// The answer's `data`, or an [ApiException] that says what went wrong.
  /// [sent] is the request's size (a large one explains an odd answer).
  Future<dynamic> _receive(
    Future<http.StreamedResponse> Function() send, {
    int sent = 0,
    bool long = false,
  }) async {
    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await send(),
      ).timeout(Duration(seconds: long ? 300 : 90));
    } on TimeoutException {
      throw ApiException('The server at $host took too long to answer.');
    } on Object {
      throw ApiException(
        "Can't reach the 3DEEZI server at $host. Check the connection.",
      );
    }
    final Object? json;
    try {
      json = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      // A web page instead of an answer: after a large save that is the
      // server's size limit (the website's "Unexpected token '<'").
      final large = response.statusCode == 413 || sent > 1024 * 1024;
      throw ApiException(
        large
            ? 'The server sent an unexpected reply. If your design contains '
                  'large images, make them smaller and try again.'
            : 'The server at $host did not answer like a 3DEEZI server '
                  '(HTTP ${response.statusCode}).',
        status: response.statusCode,
      );
    }
    final ok = response.statusCode >= 200 && response.statusCode < 300;
    if (ok && json is Map<String, dynamic>) return json['data'];
    throw ApiException(
      _message(response.statusCode, json),
      status: response.statusCode,
    );
  }

  static String _message(int status, Object? json) {
    if (status == 401) return 'Your session has expired. Please sign in again.';
    if (status == 429) return 'Too many attempts. Wait a minute and try again.';
    if (json is Map<String, dynamic>) {
      final errors = json['errors'];
      if (errors is Map && errors.isNotEmpty) {
        final first = errors.values.first;
        if (first is List && first.isNotEmpty) return '${first.first}';
      }
      final message = json['message'];
      if (message is String && message.isNotEmpty) return message;
    }
    if (status == 413) return _tooLarge;
    return 'The server could not complete the request (HTTP $status).';
  }
}
