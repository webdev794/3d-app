import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/api_client.dart';

/// Saving large designs: clear messages instead of the website's old
/// "Unexpected token '<'" (the server's size limit answers with a web page).
void main() {
  Matcher message(Object pattern) =>
      throwsA(isA<ApiException>().having((e) => e.message, 'message', pattern));

  test('a design over the size limit is refused before it is sent', () async {
    var sent = false;
    final api = ApiClient(
      baseUrl: 'https://test.example',
      client: MockClient((_) async {
        sent = true;
        return http.Response('{}', 200);
      }),
    );
    await expectLater(
      api.createProject({'image': 'x' * (ApiClient.maxBodyLength + 1)}),
      message(startsWith('This design is too large to save.')),
    );
    expect(sent, isFalse);
  });

  test('a web page after a large save asks for smaller images', () async {
    final api = ApiClient(
      baseUrl: 'https://test.example',
      client: MockClient(
        (_) async => http.Response(
          '<html><body>Request Entity Too Large</body></html>',
          413,
        ),
      ),
    );
    await expectLater(
      api.createProject({'image': 'x' * (2 * 1024 * 1024)}),
      message(contains('make them smaller')),
    );
  });

  test('a web page for a small request still names the server', () async {
    final api = ApiClient(
      baseUrl: 'https://test.example',
      client: MockClient((_) async => http.Response('<html></html>', 200)),
    );
    await expectLater(
      api.projects(),
      message(contains('did not answer like a 3DEEZI server')),
    );
  });
}
