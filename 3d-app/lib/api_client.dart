import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// The 3DEEZI server set at build time:
/// `--dart-define=API_BASE_URL=https://test.example.com`.
const _buildBaseUrl = String.fromEnvironment('API_BASE_URL');

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
    return '';
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

  /// Corporate Partner application (no account needed). Returns the reply.
  Future<String> applyPartner(Map<String, dynamic> body) async {
    final data = await _send('POST', '/partners/apply', body: body);
    return (data as Map?)?['message'] as String? ?? 'Application sent.';
  }

  // ---------- transport
  /// Sends a request and returns the response's `data`.
  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    if (!configured) {
      throw ApiException('No 3DEEZI server is set. Add it under Server.');
    }
    final request = http.Request(method, Uri.parse('$baseUrl/api/v1$path'))
      ..headers.addAll({
        'Accept': 'application/json',
        if (body != null) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      });
    if (body != null) request.body = jsonEncode(body);
    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await _client.send(request),
      ).timeout(const Duration(seconds: 90));
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
      throw ApiException(
        'The server at $host did not answer like a 3DEEZI server '
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
    if (status == 413) return 'The design is too large for the server.';
    return 'The server could not complete the request (HTTP $status).';
  }
}
