import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/widgets/site_page_io.dart';

// Pay now on phones: the pay page opens in the phone's own browser (Apple Pay,
// Google Pay); the invoice is read again when the app resumes; the in-app page
// only when no browser opens.
void main() {
  const url = 'https://test.example/invoices/INV-1001?key=abc';
  // The app's own opener (the platform channel), before the tests replace it.
  final realOpener = openExternalBrowser;
  final realFallback = openPayFallback;
  late List<String> opened;
  late List<String> inApp;
  late bool browserOpens;
  late int refreshed;

  setUp(() {
    opened = [];
    inApp = [];
    browserOpens = true;
    refreshed = 0;
    openExternalBrowser = (u) async {
      opened.add(u);
      return browserOpens;
    };
    openPayFallback = (context, u, title) async => inApp.add(u);
  });
  tearDown(() {
    openExternalBrowser = realOpener;
    openPayFallback = realFallback;
  });

  Future<void> mountPayButton(WidgetTester tester) => tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => FilledButton(
          onPressed: () async {
            await openPayLink(context, url, 'Pay now');
            refreshed++;
          },
          child: const Text('PAY NOW'),
        ),
      ),
    ),
  ));

  void lifecycle(WidgetTester tester, List<AppLifecycleState> states) {
    for (final state in states) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
  }

  testWidgets('Pay now opens the phone browser and refreshes once the app is back', (tester) async {
    lifecycle(tester, [AppLifecycleState.resumed]);
    await mountPayButton(tester);
    await tester.tap(find.text('PAY NOW'));
    await tester.pump();
    expect(opened, [url]);
    expect(inApp, isEmpty);
    // In the browser: the app is in the background, nothing is read yet.
    lifecycle(tester, [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused]);
    await tester.pump();
    expect(refreshed, 0);
    // Back in the app: the invoice is read again, once.
    lifecycle(tester, [AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]);
    await tester.pump();
    expect(refreshed, 1);
    lifecycle(tester, [AppLifecycleState.inactive, AppLifecycleState.resumed]);
    await tester.pump();
    expect(refreshed, 1);
  });

  testWidgets('Without a browser, the pay page opens inside the app instead', (tester) async {
    browserOpens = false;
    await mountPayButton(tester);
    await tester.tap(find.text('PAY NOW'));
    await tester.pump();
    expect(opened, [url]);
    expect(inApp, [url]);
    // Closing the in-app page reads the invoice again (no app resume needed).
    expect(refreshed, 1);
  });

  testWidgets('The real opener sends web links to the phone and refuses others', (tester) async {
    const channel = MethodChannel('3deezi/browser');
    final calls = <Object?>[];
    var reply = true;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.arguments);
      if (!reply) throw PlatformException(code: 'no_browser');
      return call.method == 'open';
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
    expect(await realOpener(url), isTrue);
    expect(calls, [
      {'url': url},
    ]);
    // Anything but http(s) never reaches the phone.
    expect(await realOpener('intent://pay#Intent;scheme=evil;end'), isFalse);
    expect(await realOpener('javascript:alert(1)'), isFalse);
    expect(calls, hasLength(1));
    // The phone can't open it: false, so the in-app page is used.
    reply = false;
    expect(await realOpener(url), isFalse);
  });
}
