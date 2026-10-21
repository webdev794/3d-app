import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:three_deezi/ai_service.dart';

/// The app's AI models (the same as the website's Admin › Settings): Flare for
/// the designs, Sunburst for HD, no input_fidelity for the 2.5 models, and a
/// one-time fallback to gpt-image-2 / gpt-6-luna when a model is turned down.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  final logo = base64Decode(png);

  String field(http.BaseRequest r, String name) {
    final body = utf8.decode((r as http.Request).bodyBytes, allowMalformed: true);
    final m = RegExp('name="$name"\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([^\\r\\n]*)').firstMatch(body);
    return m?.group(1) ?? '';
  }

  /// Multipart requests reach MockClient as plain requests with the encoded body.
  MockClient client(List<http.Request> seen, http.Response Function(http.Request r, int n) answer) =>
      MockClient((r) async {
        seen.add(r);
        return answer(r, seen.length);
      });

  test('the designs use Flare without input_fidelity; HD uses Sunburst', () async {
    final seen = <http.Request>[];
    final ai = AiService(apiKey: 'sk-test', client: client(seen, (_, _) => http.Response(jsonEncode({'data': [{'b64_json': png}]}), 200)));
    expect(ai.imageModel, 'gpt-image-2.5-flare');
    expect(ai.hdImageModel, 'gpt-image-2.5-sunburst');
    expect(ai.textModel, 'gpt-6-luna');
    await ai.designMockup(brief: 'A BLITZ singlet', sport: 'Rugby League', garment: 'Singlet', logos: [logo]);
    await ai.designMockup(brief: 'A BLITZ singlet', sport: 'Rugby League', garment: 'Singlet', logos: [logo], quality: 'high');
    expect(seen, hasLength(2), reason: 'no wasted input_fidelity round trip');
    expect(field(seen[0], 'model'), 'gpt-image-2.5-flare');
    expect(field(seen[0], 'quality'), 'medium');
    expect(field(seen[1], 'model'), 'gpt-image-2.5-sunburst');
    expect(field(seen[1], 'quality'), 'high');
    for (final r in seen) {
      expect(utf8.decode(r.bodyBytes, allowMalformed: true), isNot(contains('input_fidelity')));
      expect('name="image[]"'.allMatches(utf8.decode(r.bodyBytes, allowMalformed: true)).length, 2);
    }
    // An option card: one front view, square, with its own palette (no dark body rule).
    await ai.designMockup(brief: 'A BLITZ singlet', sport: 'Rugby League', garment: 'Singlet', logos: [logo], view: 'front', direction: {'body': '#FFFFFF', 'palette': 'white, blue', 'front': 'a white body with a blue sash'});
    expect(field(seen[2], 'size'), '1024x1024');
    final card = utf8.decode(seen[2].bodyBytes, allowMalformed: true);
    expect(card, contains('the front view only'));
    expect(card, isNot(contains('prefer a dark body')));
    expect(AiService.printSheetPrompt('Rugby League', 'Singlet', 1, frontOnly: true), contains('design the back to match'));
    expect(AiService.takesInputFidelity('gpt-image-2'), isTrue);
    expect(AiService.takesInputFidelity('gpt-image-2.5-flare'), isFalse);
  });

  test('a turned-down image model falls back once to gpt-image-2, with input_fidelity', () async {
    final seen = <http.Request>[];
    final ai = AiService(
      apiKey: 'sk-test',
      imageModel: 'gpt-image-9-nova',
      client: client(seen, (r, n) => n == 1
          ? http.Response(jsonEncode({'error': {'message': 'The model `gpt-image-9-nova` does not exist.', 'code': 'model_not_found'}}), 404)
          : http.Response(jsonEncode({'data': [{'b64_json': png}]}), 200)),
    );
    await ai.designMockup(brief: 'A BLITZ singlet', sport: 'Rugby League', garment: 'Singlet', logos: [logo]);
    expect(seen.map((r) => field(r, 'model')), ['gpt-image-9-nova', 'gpt-image-2']);
    expect(field(seen[1], 'input_fidelity'), 'high');
  });

  test('a turned-down text model falls back once to gpt-6-luna; a content refusal is not retried', () async {
    final seen = <http.Request>[];
    final ai = AiService(
      apiKey: 'sk-test',
      textModel: 'gpt-7-nope',
      client: client(seen, (r, n) => n == 1
          ? http.Response(jsonEncode({'error': {'message': "Invalid value for 'model'.", 'param': 'model'}}), 400)
          : http.Response(jsonEncode({'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': 'Sporty and bold.'}]}]}), 200)),
    );
    await ai.rewriteBrief('a jersey', BriefMode.values.first).catchError((_) => '');
    expect(seen.map((r) => jsonDecode(r.body)['model']), ['gpt-7-nope', 'gpt-6-luna']);

    final refused = <http.Request>[];
    final strict = AiService(
      apiKey: 'sk-test',
      client: client(refused, (_, _) => http.Response(jsonEncode({'error': {'message': 'Rejected by the safety system.', 'code': 'moderation_blocked'}}), 400)),
    );
    await expectLater(strict.designMockup(brief: 'x', sport: 'Rugby League', garment: 'Singlet'), throwsA(isA<AiException>()));
    expect(refused, hasLength(1));
  });


  test('planned concepts keep the chosen hoodie or pocket polo (the schema offers them)', () async {
    final seen = <http.Request>[];
    Map<String, dynamic> spec(String garment) => {
      'designName': 'Blitz', 'detected': garment, 'summary': 's', 'findings': <String>[], 'mainColor': '#101A2E', 'secondaryColor': '#D4A017',
      'accentColor': '#FFFFFF', 'pattern': 'Solid', 'fabric': 'Standard', 'logoText': 'blitz', 'renderPrompt': 'r', 'patternMotif': '',
      'sport': 'Training', 'garment': garment,
    };
    final ai = AiService(apiKey: 'sk-test', client: client(seen, (_, _) => http.Response(jsonEncode({'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': jsonEncode({'concepts': [spec('Jersey'), spec('Zip hoodie'), spec('Hoodie')]})}]}]}), 200)));
    final kept = await ai.planConcepts(brief: 'A club zip hoodie', garment: 'Zip hoodie');
    expect(kept.map((s) => s.garment), everyElement('Zip hoodie'));
    expect(utf8.decode(seen.single.bodyBytes), allOf(contains('Zip hoodie'), contains('Polo with pocket')));
    final free = await ai.planConcepts(brief: 'A darts shirt');
    expect(free.map((s) => s.garment), ['Jersey', 'Zip hoodie', 'Hoodie']);
  });
}
