import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';

import 'features_test.dart' show FakeStore;

/// Against a running website:
/// flutter test test/api_live_test.dart --dart-define=API_BASE_URL=http://127.0.0.1:8000
void main() {
  const base = String.fromEnvironment('API_BASE_URL');
  final art = File('assets/images/brand.png');

  test('register, upload a full project and read it back', () async {
    SharedPreferences.setMockInitialValues({});
    final c = AppController(
      store: FakeStore(),
      api: ApiClient(baseUrl: base),
    );
    final email = 'app-${DateTime.now().millisecondsSinceEpoch}@3deezi.test';
    expect(
      await c.register(
        name: 'App Live',
        email: email,
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
      ),
      isNull,
    );
    final logo = art.readAsBytesSync();
    c
      ..startDyo()
      ..sport = 'Ice Hockey'
      ..garment = 'Training Tee'
      ..logoImage = logo
      ..sponsorImage = logo
      ..patternTile = logo
      ..renderFront = logo
      ..spec = const DesignSpec(
        designName: 'Live',
        detected: 'Tee',
        summary: 'Check',
        findings: ['a'],
        mainColor: Color(0xff0b1016),
        secondaryColor: Color(0xff00c2cc),
        accentColor: Color(0xff36e3ee),
        pattern: 'Velocity',
        fabric: 'Mesh',
        logoText: 'LIVE',
        renderPrompt: 'x',
        patternMotif: 'y',
      );
    c.saveProject('Live upload', thumbnail: logo);
    for (var i = 0; i < 50 && c.projects.first.pendingUpload; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    final p = c.projects.first;
    expect(p.syncError, isNull);
    expect(p.remoteId, isNotNull);

    // A second device signs in and gets the same project.
    final other = AppController(
      store: FakeStore(),
      api: ApiClient(baseUrl: base),
    );
    expect(await other.signIn(email: email, password: 'Password123!'), isNull);
    await other.syncProjects();
    final copy = other.projects.firstWhere((x) => x.remoteId == p.remoteId);
    expect(copy.sport, 'Ice Hockey');
    expect(copy.garment, 'Training Tee');
    expect(copy.kit.fabric, c.fabric);
    expect(copy.kit.spec?.designName, 'Live');
    expect(copy.thumbnail, logo);
    expect(copy.kit.sponsorImage, logo);
    expect(copy.renderFront, logo);

    other.deleteProject(copy);
    await Future<void>.delayed(const Duration(seconds: 1));
    await c.syncProjects();
    expect(c.projects.any((x) => x.remoteId == p.remoteId), isFalse);
    await c.signOut();
    await other.signOut();
  }, skip: base.isEmpty ? 'Pass --dart-define=API_BASE_URL' : false);
}
