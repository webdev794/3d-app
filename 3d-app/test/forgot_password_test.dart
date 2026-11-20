import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/onboarding.dart';

import 'features_test.dart' show FakeStore;

/// POST /auth/code, /auth/code/login and /auth/code/reset, as LoginCodeController.
class CodeServer {
  final calls = <String, Map<String, dynamic>>{};
  int sends = 0;

  late final client = MockClient((r) async {
    final path = r.url.path.replaceFirst('/api/v1', '');
    final body = r.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(r.body) as Map<String, dynamic>;
    calls[path] = body;
    http.Response json(Object data, [int status = 200]) => http.Response.bytes(
      utf8.encode(jsonEncode(data)),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
    final signedIn = {
      'data': {
        'user': {'id': 7, 'name': 'Sam Taylor', 'email': body['email']},
        'token': 'tok-7',
      },
    };
    if (path == '/auth/code') {
      if (++sends > 1)
        return json({
          'message': 'x',
          'errors': {
            'email': [
              'We have just sent a code. You can ask for another in 42 seconds.',
            ],
          },
        }, 429);
      return json({
        'data': {
          'message':
              'If an account uses this email address, we have sent it a 6-digit code. It works for 15 minutes.',
          'minutes': 15,
        },
      });
    }
    if (path == '/auth/code/login' || path == '/auth/code/reset') {
      if (body['code'] != '123456')
        return json({
          'message': 'x',
          'errors': {
            'code': [
              'That code is not correct or has expired. Check the email, or ask for a new code.',
            ],
          },
        }, 422);
      return json(signedIn);
    }
    if (path == '/projects') return json({'data': []});
    return http.Response('{"message":"Not found."}', 404);
  });
}

Future<(AppController, CodeServer, List<Object?>)> open(
  WidgetTester tester,
) async {
  SharedPreferences.setMockInitialValues({});
  final server = CodeServer();
  final c = AppController(
    store: FakeStore(),
    api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
  );
  final results = <Object?>[];
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async => results.add(
                await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        Scaffold(body: AccountSheet(c, register: false)),
                  ),
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return (c, server, results);
}

void main() {
  testWidgets('forgot password: send a code, then sign in with it', (
    tester,
  ) async {
    final (c, server, results) = await open(tester);
    await tester.enterText(find.byType(TextField).first, 'sam@club.com');
    expect(find.text('Forgot password?'), findsOneWidget);
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.text('FORGOT YOUR PASSWORD?'), findsOneWidget);
    // The email typed on the sign-in form is kept.
    expect(find.widgetWithText(TextField, 'sam@club.com'), findsOneWidget);

    await tester.tap(find.text('SEND CODE'));
    await tester.pumpAndSettle();
    expect(server.calls['/auth/code'], {'email': 'sam@club.com'});
    expect(find.text('CHECK YOUR EMAIL'), findsOneWidget);
    expect(
      // A non-breaking hyphen keeps "6-digit" on one line.
      find.textContaining('we have sent it a 6‑digit code'),
      findsOneWidget,
    );
    expect(find.textContaining('send a new code in 60s'), findsOneWidget);

    // A wrong code: the server's words.
    await tester.enterText(find.byKey(const Key('forgot-code')), '111111');
    await tester.tap(find.text('SIGN IN'));
    await tester.pumpAndSettle();
    expect(find.textContaining('That code is not correct'), findsOneWidget);
    expect(results, isEmpty);

    await tester.enterText(find.byKey(const Key('forgot-code')), '123456');
    await tester.tap(find.text('SIGN IN'));
    await tester.pumpAndSettle();
    expect(server.calls['/auth/code/login']!['code'], '123456');
    expect(results, [true]);
    expect(c.user?.email, 'sam@club.com');
    expect(c.api.token, 'tok-7');
  });

  testWidgets('forgot password: set a new password with the code', (
    tester,
  ) async {
    final (c, server, results) = await open(tester);
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('forgot-email')),
      'sam@club.com',
    );
    await tester.tap(find.text('SEND CODE'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Set a new password'));
    await tester.pumpAndSettle();
    expect(find.text('SAVE AND SIGN IN'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('forgot-code')), '123456');
    await tester.enterText(
      find.byKey(const Key('forgot-password')),
      'new-password-2',
    );
    await tester.enterText(
      find.byKey(const Key('forgot-confirm')),
      'other-password',
    );
    await tester.tap(find.text('SAVE AND SIGN IN'));
    await tester.pumpAndSettle();
    expect(find.text('The new passwords do not match.'), findsOneWidget);
    expect(server.calls.containsKey('/auth/code/reset'), isFalse);

    await tester.enterText(
      find.byKey(const Key('forgot-confirm')),
      'new-password-2',
    );
    await tester.tap(find.text('SAVE AND SIGN IN'));
    await tester.pumpAndSettle();
    expect(server.calls['/auth/code/reset'], {
      'email': 'sam@club.com',
      'code': '123456',
      'password': 'new-password-2',
      'password_confirmation': 'new-password-2',
      'device_name': startsWith('3DEEZI'),
    });
    expect(results, [true]);
    expect(c.user?.name, 'Sam Taylor');
  });

  testWidgets(
    'forgot password: asking again too soon shows the server message; back to sign in',
    (tester) async {
      final (_, server, _) = await open(tester);
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('forgot-email')),
        'sam@club.com',
      );
      await tester.tap(find.text('SEND CODE'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change email'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('SEND CODE'));
      await tester.pumpAndSettle();
      expect(server.sends, 2);
      expect(
        find.text(
          'We have just sent a code. You can ask for another in 42 seconds.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Remembered it? Back to sign in'));
      await tester.pumpAndSettle();
      expect(
        find.text('SIGN IN'),
        findsNWidgets(2),
      ); // the title and the button
      expect(find.text('Forgot password?'), findsOneWidget);
    },
  );
}
