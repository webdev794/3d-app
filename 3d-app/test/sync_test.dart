import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_sync.dart';

import 'features_test.dart' show FakeStore;

/// A PNG header followed by filler, so it is sent as an image data URL.
final png = Uint8List.fromList([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, //
  ...List.filled(24, 7),
]);

/// A tiny in-memory copy of the website's `/api/v1`.
class FakeServer {
  final projects = <int, Map<String, dynamic>>{};
  final users = <String, String>{};
  final orders = <Map<String, dynamic>>[];
  final partners = <Map<String, dynamic>>[];
  var nextId = 1;
  late final client = MockClient(_handle);

  Future<http.Response> _handle(http.Request r) async {
    final path = r.url.path.replaceFirst('/api/v1', '');
    final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body);
    http.Response ok(Object data, [int status = 200]) =>
        http.Response(jsonEncode({'data': data}), status);
    final user = {'id': 1, 'name': 'Fabian', 'email': 'fabian@3deezi.com'};
    if (path == '/auth/register') {
      users[body['email']] = body['password'];
      return ok({'user': user, 'token': 'tok'}, 201);
    }
    if (path == '/auth/login') {
      return users[body['email']] == body['password']
          ? ok({'user': user, 'token': 'tok'})
          : http.Response(
              jsonEncode({
                'message': 'invalid',
                'errors': {
                  'email': ['The email or password is incorrect.'],
                },
              }),
              422,
            );
    }
    if (path == '/partners/apply') {
      if ((body['company'] ?? '').isEmpty) {
        return http.Response(
          '{"message":"The company field is required."}',
          422,
        );
      }
      partners.add(body);
      return ok({'message': 'Thanks! The 3DEEZI team will contact you.'}, 201);
    }
    if (r.headers['Authorization'] != 'Bearer tok') {
      return http.Response('{"message":"Unauthenticated."}', 401);
    }
    if (path == '/orders' && r.method == 'GET') return ok(orders);
    if (path == '/orders' && r.method == 'POST') {
      final sizes = (body['sizes'] as Map).cast<String, int>();
      final order = <String, dynamic>{
        ...body,
        'id': orders.length + 1,
        'number': '3DZ-${1000 + orders.length + 1}',
        'status': 'pending',
        'quantity': sizes.values.fold(0, (a, b) => a + b),
        'total': null,
        'project': {
          'id': body['project_id'],
          'name': projects[body['project_id']]?['name'],
        },
      };
      orders.insert(0, order);
      return ok(order, 201);
    }
    if (path == '/projects' && r.method == 'GET') {
      return ok(projects.values.toList());
    }
    if (path == '/projects' && r.method == 'POST') {
      final id = nextId++;
      return ok(projects[id] = {...body, 'id': id, 'version': 1}, 201);
    }
    final id = int.parse(path.split('/').last);
    if (!projects.containsKey(id)) return http.Response('{}', 404);
    if (r.method == 'DELETE') {
      projects.remove(id);
      return ok({'message': 'Project deleted.'});
    }
    final version = projects[id]!['version'] as int;
    return ok(projects[id] = {...body, 'id': id, 'version': version + 1});
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('server addresses are normalised', () {
    expect(ApiClient.normalize('test.3deezi.com/'), 'https://test.3deezi.com');
    expect(
      ApiClient.normalize('http://10.0.2.2:8000/api/v1/'),
      'http://10.0.2.2:8000',
    );
    expect(ApiClient.normalize('  '), '');
  });

  test(
    'register, save uploads, edits update, website projects come down',
    () async {
      final server = FakeServer();
      final store = FakeStore();
      final c = AppController(
        store: store,
        api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
      );

      expect(
        await c.signIn(email: 'nobody@x.com', password: 'wrong-pass'),
        'The email or password is incorrect.',
      );
      expect(
        await c.register(
          name: 'Fabian',
          email: 'fabian@3deezi.com',
          password: 'Password123!',
          passwordConfirmation: 'Password123!',
        ),
        isNull,
      );
      expect(c.signedIn, isTrue);
      expect(c.name, 'Fabian');
      await pumpEventQueue();

      // A new project uploads with the server's ids and garment slugs.
      c
        ..startDyo()
        ..sport = 'Soccer'
        ..garment = 'Full Kit'
        ..sponsorImage = png;
      c.saveProject('Mantis Home', thumbnail: png);
      await pumpEventQueue();
      final mine = c.projects.first;
      expect(mine.remoteId, 1);
      expect(mine.pendingUpload, isFalse);
      final sent = server.projects[1]!;
      expect(sent['sport'], 'football');
      expect(sent['garment'], 'fullkit');
      expect(sent['thumbnail'], startsWith('data:image/png;base64,'));
      expect(sent['design']['sponsorImage'], startsWith('data:image/png'));
      expect(sent['design']['app']['sport'], 'Soccer');

      // Saving again under the same name updates the same server project.
      c.saveProject('Mantis Home');
      await pumpEventQueue();
      expect(server.projects.length, 1);
      expect(server.projects[1]!['name'], 'Mantis Home');
      expect(c.projects.first.remoteVersion, 2);

      // A project made on the website appears after a sync.
      server.projects[9] = {
        'id': 9,
        'version': 3,
        'name': 'Web Kit',
        'sport': 'rugby-union',
        'garment': 'polo',
        'mode': 'dyo',
        'updated_at': DateTime.now().toIso8601String(),
        'design': {
          'main': '#112233',
          'secondary': '#445566',
          'accent': '#778899',
          'pattern': 'Stripes',
          'logoText': 'WEB',
        },
      };
      await c.syncProjects();
      final web = c.projects.firstWhere((p) => p.remoteId == 9);
      expect(web.sport, 'Rugby Union');
      expect(web.garment, 'Polo');
      expect(web.kit.pattern, 'Stripes');
      expect(ProjectSync.hex(web.kit.mainColor), '#112233');
      expect(store.saved.containsKey(web.id), isTrue);

      // Deleted on the website: gone from the app after the next sync.
      server.projects.remove(9);
      await c.syncProjects();
      expect(c.projects.any((p) => p.remoteId == 9), isFalse);

      // Signing out removes the account's projects from the device.
      await c.signOut();
      expect(c.signedIn, isFalse);
      expect(c.projects.any((p) => p.remoteId != null), isFalse);
    },
  );

  test('the session reopens on the next launch', () async {
    final server = FakeServer();
    final first = AppController(
      store: FakeStore(),
      api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
    );
    await first.register(
      name: 'Fabian',
      email: 'f@x.com',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
    );
    final next = AppController(
      store: FakeStore(),
      api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
    );
    await next.restoreSession();
    expect(next.signedIn, isTrue);
    expect(next.api.token, 'tok');
  });

  test('an expired session signs out but keeps unsent work', () async {
    final server = FakeServer();
    final c = AppController(
      store: FakeStore(),
      api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
    );
    await c.register(
      name: 'F',
      email: 'f@x.com',
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
    );
    await pumpEventQueue();
    c.api.token = 'revoked';
    c.saveProject('Offline edit');
    await pumpEventQueue();
    expect(c.signedIn, isFalse);
    expect(c.syncMessage, contains('expired'));
    expect(c.projects.first.pendingUpload, isTrue);
  });

  test(
    'approval syncs down; kits are ordered after uploading; partners apply',
    () async {
      final server = FakeServer();
      final c = AppController(
        store: FakeStore(),
        api: ApiClient(client: server.client, baseUrl: 'https://test.example'),
      );

      // Partner applications need no account.
      expect(
        await c.api.applyPartner({
          'company': 'Acme Sport',
          'name': 'Jo',
          'email': 'jo@acme.test',
        }),
        contains('contact you'),
      );
      expect(server.partners.single['company'], 'Acme Sport');
      await expectLater(
        c.api.applyPartner({'company': ''}),
        throwsA(isA<ApiException>()),
      );

      // Ordering needs an account.
      c
        ..startDyo()
        ..sport = 'Soccer';
      c.saveProject('Club Home');
      final kit = c.projects.first;
      await expectLater(
        c.orderKit(kit, {
          'sizes': {'M': 2},
          'contact_name': 'Jo',
        }),
        throwsA(isA<ApiException>()),
      );

      await c.register(
        name: 'Fabian',
        email: 'fabian@3deezi.com',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
      );
      await pumpEventQueue();
      expect(kit.remoteId, isNotNull);

      final order = await c.orderKit(kit, {
        'sizes': {'M': 2, 'L': 3},
        'contact_name': 'Jo',
        'phone': '0400 000 000',
      });
      expect(order['number'], '3DZ-1001');
      expect(server.orders.single['project_id'], kit.remoteId);
      expect(server.orders.single['quantity'], 5);
      c.orders = [];
      await c.loadOrders();
      expect(c.orders.single['project']['name'], 'Club Home');

      // An administrator approves the kit on the website: the app picks it up
      // although the version did not change.
      server.projects[kit.remoteId!] = {
        ...server.projects[kit.remoteId!]!,
        'status': 'approved',
      };
      await c.syncProjects();
      expect(
        c.projects.firstWhere((p) => p.remoteId == kit.remoteId).approved,
        isTrue,
      );

      await c.signOut();
      expect(c.orders, isEmpty);
    },
  );
}
