import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/edit_profile.dart';
import 'package:three_deezi/screens/library.dart' show ProfileScreen;

import 'features_test.dart' show FakeStore;

/// Profile › Edit profile (client 2026-10-26, as the website's account menu):
/// PATCH /auth/me with the name, and with the current password a new email
/// address or password.
void main() {
  late List<Map<String, dynamic>> sent;
  late Map<String, dynamic> account;

  AppController controller() {
    sent = [];
    account = {'id': 7, 'name': 'Pat Tester', 'email': 'pat@example.test'};
    final client = MockClient((r) async {
      if (r.method == 'PATCH' && r.url.path == '/api/v1/auth/me') {
        final body = jsonDecode(r.body) as Map<String, dynamic>;
        sent.add(body);
        final changesLogin =
            (body.containsKey('email') && body['email'] != account['email']) ||
            body.containsKey('password');
        if (changesLogin && body['current_password'] != 'right-password') {
          return http.Response(
            jsonEncode({
              'message': 'Your current password is not correct.',
              'errors': {
                'current_password': ['Your current password is not correct.'],
              },
            }),
            422,
          );
        }
        account = {
          ...account,
          'name': body['name'],
          if (body['email'] != null) 'email': body['email'],
        };
        return http.Response(jsonEncode({'data': account}), 200);
      }
      return http.Response('{"message":"Not found."}', 404);
    });
    final c = AppController(
      store: FakeStore(),
      api: ApiClient(client: client, baseUrl: 'https://test.example'),
    );
    c.user = const ApiUser(
      id: 7,
      name: 'Pat Tester',
      email: 'pat@example.test',
    );
    c.api.token = 'tok';
    return c;
  }

  Future<void> mount(WidgetTester tester, Widget child) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 1400);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
    await tester.pumpAndSettle();
  }

  Future<void> save(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Save changes'));
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
  }

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('Profile lists Edit profile only when signed in', (tester) async {
    final c = controller();
    await mount(tester, ProfileScreen(c));
    expect(find.text('Edit profile'), findsOneWidget);
    c.user = null;
    await mount(tester, ProfileScreen(c));
    expect(find.text('Edit profile'), findsNothing);
  });

  testWidgets('a new name is saved and Profile shows it', (tester) async {
    final c = controller();
    await mount(tester, ProfileScreen(c));
    await tester.tap(find.text('Edit profile'));
    await tester.pumpAndSettle();
    expect(find.byType(EditProfileScreen), findsOneWidget);
    // Only the name changes: no current password needed.
    await tester.enterText(find.byKey(const ValueKey('edit-name')), 'Sam Lee');
    await tester.pump();
    expect(find.byKey(const ValueKey('edit-current')), findsNothing);
    await save(tester);
    expect(sent.single, {'name': 'Sam Lee'});
    expect(find.text('Your profile is saved.'), findsOneWidget);
    expect(c.user!.name, 'Sam Lee');
    expect(c.name, 'Sam Lee');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('3deezi.user'), contains('Sam Lee'));
    // Back on Profile: the new name.
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded).first);
    await tester.pumpAndSettle();
    expect(find.byType(EditProfileScreen), findsNothing);
    expect(find.text('Sam Lee'), findsOneWidget);
  });

  testWidgets('a new email needs the right current password', (tester) async {
    final c = controller();
    await mount(tester, EditProfileScreen(c));
    await tester.enterText(
      find.byKey(const ValueKey('edit-email')),
      'sam@example.test',
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('edit-current')), findsOneWidget);
    // No current password: refused before anything is sent.
    await save(tester);
    expect(sent, isEmpty);
    expect(find.textContaining('Enter your current password'), findsOneWidget);
    // A wrong one: refused by the server, nothing changes.
    await tester.enterText(
      find.byKey(const ValueKey('edit-current')),
      'wrong-password',
    );
    await save(tester);
    expect(find.text('Your current password is not correct.'), findsOneWidget);
    expect(c.user!.email, 'pat@example.test');
    // The right one: saved.
    await tester.enterText(
      find.byKey(const ValueKey('edit-current')),
      'right-password',
    );
    await save(tester);
    expect(sent.last, {
      'name': 'Pat Tester',
      'email': 'sam@example.test',
      'current_password': 'right-password',
    });
    expect(c.user!.email, 'sam@example.test');
    expect(find.text('Your profile is saved.'), findsOneWidget);
  });

  testWidgets('a new password must be typed twice the same', (tester) async {
    final c = controller();
    await mount(tester, EditProfileScreen(c));
    await tester.enterText(
      find.byKey(const ValueKey('edit-password')),
      'Brand-New-123',
    );
    await tester.enterText(
      find.byKey(const ValueKey('edit-confirm')),
      'Brand-New-124',
    );
    await tester.pump();
    await tester.enterText(
      find.byKey(const ValueKey('edit-current')),
      'right-password',
    );
    await save(tester);
    expect(sent, isEmpty);
    expect(find.text('The new passwords do not match.'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('edit-confirm')),
      'Brand-New-123',
    );
    await save(tester);
    expect(sent.single, {
      'name': 'Pat Tester',
      'password': 'Brand-New-123',
      'password_confirmation': 'Brand-New-123',
      'current_password': 'right-password',
    });
    expect(
      find.textContaining('other devices were signed out'),
      findsOneWidget,
    );
  });
}
