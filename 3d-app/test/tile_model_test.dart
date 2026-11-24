import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/model_flags.dart';

/// Client 2026-11-17, 571.png: a saved Football jersey design that still had
/// the Rugby League jersey's model flag showed that jersey; the tile's model
/// flags win (model_flags.dart withTileModel, AppController.applyTileModel).
void main() {
  AppController football(Map<String, String> zoneColors, {String? neck}) =>
      AppController()
        ..sport = 'Soccer'
        ..garment = 'Jersey'
        ..productName = 'Football jersey'
        ..zoneColors = zoneColors
        ..neck = neck;

  test('another model\'s flag goes, the tile\'s stays', () {
    final c = football({'scJersey': '#fff21a', 'fbJersey': '#ffffff'});
    expect(c.applyTileModel(), isTrue);
    expect(c.zoneColors, {'scJersey': '#fff21a'});
    expect(c.applyTileModel(), isFalse, reason: 'nothing more to change');
  });

  test('a design made before the tile had its model gets the flag', () {
    final c = football({'cuffStripe': '#e2bf3a'});
    expect(c.applyTileModel(), isTrue);
    expect(c.zoneColors['scJersey'], isNotNull);
    expect(c.zoneColors['cuffStripe'], '#e2bf3a');
  });

  test('a neck the model does not offer falls back to its own', () {
    final c = football({'scJersey': '#fff21a'}, neck: 'v');
    expect(c.applyTileModel(), isTrue);
    expect(c.neck, isNull);
  });

  test('a choice made on a model stays with it', () {
    expect(
      withTileModel(
        {'fbJersey': '#32324c', 'fbV': '#ffffff'},
        {'fbJersey': '#32324c'},
      ),
      isNull,
    );
  });

  test('a design on no tile is left alone', () {
    final c = football({'fbJersey': '#ffffff'})..productName = '';
    expect(c.applyTileModel(), isFalse);
    expect(c.zoneColors, {'fbJersey': '#ffffff'});
  });
}
