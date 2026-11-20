import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app_controller.dart';

void main() {
  test('HQ jersey switch is off by default', () async {
    SharedPreferences.setMockInitialValues({});
    final c = AppController();
    await c.restoreDevicePrefs();
    expect(c.hqJersey, isFalse);
  });

  test('HQ jersey switch is remembered on the device', () async {
    SharedPreferences.setMockInitialValues({});
    AppController().setHqJersey(true);
    await Future<void>.delayed(Duration.zero);
    expect(
      (await SharedPreferences.getInstance()).getBool(AppController.hqJerseyKey),
      isTrue,
    );
    final reopened = AppController();
    await reopened.restoreDevicePrefs();
    expect(reopened.hqJersey, isTrue);
    reopened.setHqJersey(false);
    await Future<void>.delayed(Duration.zero);
    final again = AppController();
    await again.restoreDevicePrefs();
    expect(again.hqJersey, isFalse);
  });
}
