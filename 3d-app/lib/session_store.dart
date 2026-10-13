import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// The signed-in account and the chosen server, kept between launches.
class Session {
  const Session({this.baseUrl, this.token, this.user});
  final String? baseUrl, token;
  final ApiUser? user;
}

class SessionStore {
  const SessionStore();

  static const _base = '3deezi.server', _token = '3deezi.token';
  static const _user = '3deezi.user';

  Future<Session> load() async {
    final prefs = await SharedPreferences.getInstance();
    final user = prefs.getString(_user);
    return Session(
      baseUrl: prefs.getString(_base),
      token: prefs.getString(_token),
      user: user == null
          ? null
          : ApiUser.fromJson(jsonDecode(user) as Map<String, dynamic>),
    );
  }

  Future<void> saveServer(String baseUrl) async =>
      (await SharedPreferences.getInstance()).setString(_base, baseUrl);

  Future<void> saveAccount(String token, ApiUser user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_token, token);
    await prefs.setString(_user, jsonEncode(user.toJson()));
  }

  Future<void> clearAccount() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_token);
    await prefs.remove(_user);
  }
}
