import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import '../app_controller.dart';
import '../assist.dart';
import 'ui.dart';

/// 3DEEZI ASSIST, the help chat on every screen: the launcher (bottom right)
/// shows and hides the chat. Same look as on the website.
class AssistOverlay extends StatefulWidget {
  const AssistOverlay(this.assist, {super.key});
  final AssistController assist;
  @override
  State<AssistOverlay> createState() => _AssistOverlayState();
}

class _AssistOverlayState extends State<AssistOverlay> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  AssistController get a => widget.assist;

  @override
  void initState() {
    super.initState();
    a.addListener(_toEnd);
  }

  @override
  void dispose() {
    a.removeListener(_toEnd);
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Keeps the newest message in view.
  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  });

  void _send() {
    final text = _input.text;
    if (text.trim().isEmpty || a.busy) return;
    _input.clear();
    a.ask(text);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: Listenable.merge([a, a.app]),
    builder: (context, _) {
      // Also out of the way of the 3D view's own screens (the print layout
      // check).
      if (AssistController.hiddenOn.contains(a.app.screen) || a.app.viewerModal)
        return const SizedBox.shrink();
      // The Home has its own "Ask 3DEEZI Assist" link (client picture
      // 166.jpg): the round launcher shows there only while the chat is open.
      // The Orders tab too (168.jpg: "Need help? 3DEEZI Assist").
      if ((a.app.screen == AppScreen.home ||
              a.app.screen == AppScreen.orderHub) &&
          !a.open) {
        return const SizedBox.shrink();
      }
      // A round button above the full-width buttons most screens end with;
      // on the Studio and Artboard above their tool bars, over the stage.
      final tool =
          a.app.screen == AppScreen.studio ||
          a.app.screen == AppScreen.artboard;
      // YOUR DESIGNS (AI results): beside the slim refine bar, clear of the
      // large design and the download button.
      final bottom = tool
          ? 172.0
          : a.app.screen == AppScreen.concepts
          ? 11.0
          : 92.0;
      const size = 50.0;
      return LayoutBuilder(
        builder: (context, box) => Stack(
          children: [
            if (a.open)
              Positioned(
                left: 10,
                right: 10,
                bottom: bottom + size + 12,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: box.maxHeight - bottom - size - 30,
                  ),
                  child: PointerInterceptor(child: _panel()),
                ),
              ),
            Positioned(
              right: 12,
              bottom: bottom,
              child: PointerInterceptor(child: _launcher(size: size)),
            ),
          ],
        ),
      );
    },
  );

  Widget _launcher({required double size}) => Tooltip(
    message: '3DEEZI ASSIST',
    child: Semantics(
      button: true,
      label: a.open ? 'Hide 3DEEZI ASSIST' : 'Ask 3DEEZI ASSIST',
      child: GestureDetector(
        key: const ValueKey('assist-launcher'),
        onTap: a.toggle,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xf20a1a2c), Color(0xf2050d18)],
            ),
            shape: BoxShape.circle,
            border: Border.all(
              color: Palette.cyan.withValues(alpha: .8),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Palette.cyan.withValues(alpha: .33),
                blurRadius: 20,
              ),
              const BoxShadow(
                color: Color(0x99000000),
                blurRadius: 24,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: Center(child: Sparkle(size: a.open ? 22 : 25)),
        ),
      ),
    ),
  );

  Widget _panel() => Container(
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xf50a1626), Color(0xf7050c17)],
      ),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Palette.cyan.withValues(alpha: .53)),
      boxShadow: [
        BoxShadow(color: Palette.cyan.withValues(alpha: .25), blurRadius: 26),
        const BoxShadow(
          color: Color(0xcc000000),
          blurRadius: 60,
          offset: Offset(0, 24),
        ),
      ],
    ),
    clipBehavior: Clip.antiAlias,
    child: Material(
      type: MaterialType.transparency,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _header(),
          Flexible(
            child: ListView(
              controller: _scroll,
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
              children: [
                _botRow(
                  Text.rich(
                    TextSpan(text: AssistController.greeting),
                    style: _bubbleText,
                  ),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.only(left: 44),
                  child: Column(
                    children: [for (final s in a.suggestions) _chip(s)],
                  ),
                ),
                for (final m in a.messages) ...[
                  const SizedBox(height: 12),
                  m.fromUser
                      ? _userRow(m.text)
                      : _botRow(_answer(m), error: m.error),
                ],
                if (a.busy) ...[
                  const SizedBox(height: 12),
                  _botRow(const _TypingDots()),
                ],
              ],
            ),
          ),
          _inputRow(),
        ],
      ),
    ),
  );

  Widget _header() => Container(
    padding: const EdgeInsets.fromLTRB(16, 14, 8, 12),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Color(0x10ffffff))),
    ),
    child: Row(
      children: [
        const Sparkle(size: 28),
        const SizedBox(width: 12),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '3DEEZI ASSIST',
                style: TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: 19,
                  letterSpacing: .8,
                  color: Color(0xfff4f9ff),
                ),
              ),
              SizedBox(height: 2),
              Text(
                'AI help assistant',
                style: TextStyle(fontSize: 12, color: Color(0xff8fa0b5)),
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: a.minimise,
          tooltip: 'Minimise',
          icon: const Icon(Icons.remove, size: 20, color: Color(0xffd6e2ef)),
        ),
        IconButton(
          onPressed: a.endChat,
          tooltip: 'End chat',
          icon: const Icon(Icons.close, size: 20, color: Color(0xffd6e2ef)),
        ),
      ],
    ),
  );

  static const _bubbleText = TextStyle(
    fontSize: 13.5,
    height: 1.5,
    color: Color(0xffe6eef8),
  );

  Widget _botRow(Widget content, {bool error = false}) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xff071a2b),
          border: Border.all(
            color: Palette.cyan.withValues(alpha: .6),
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: Palette.cyan.withValues(alpha: .2),
              blurRadius: 12,
            ),
          ],
        ),
        child: const Sparkle(size: 18),
      ),
      const SizedBox(width: 10),
      Flexible(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: error ? const Color(0xff2a1418) : const Color(0xff111d2e),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: error ? const Color(0x55ff6b6b) : const Color(0x0fffffff),
            ),
          ),
          child: content,
        ),
      ),
    ],
  );

  Widget _userRow(String text) => Align(
    alignment: Alignment.centerRight,
    child: Container(
      constraints: const BoxConstraints(maxWidth: 260),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xff3fd9f8), Color(0xff1fb6ec)],
        ),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(10),
          topRight: Radius.circular(10),
          bottomLeft: Radius.circular(10),
          bottomRight: Radius.circular(3),
        ),
        boxShadow: [
          BoxShadow(color: Palette.cyan.withValues(alpha: .27), blurRadius: 16),
        ],
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 13.5,
          height: 1.5,
          color: Color(0xff03131f),
          fontWeight: FontWeight.w500,
        ),
      ),
    ),
  );

  Widget _chip(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Material(
      color: const Color(0xff0a1828),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(9),
        side: BorderSide(color: Palette.cyan.withValues(alpha: .3)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(9),
        onTap: a.busy ? null : () => a.ask(text),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  text,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xffdce7f3),
                  ),
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: Palette.cyan),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _answer(AssistMessage m) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ..._rich(m.text),
      if (m.done != null) ...[
        const SizedBox(height: 8),
        const Divider(height: 1, color: Color(0x12ffffff)),
        const SizedBox(height: 7),
        for (final d in m.done!)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  d.ok
                      ? Icons.check
                      : d.info
                      ? Icons.info_outline
                      : Icons.warning_amber_rounded,
                  size: 14,
                  color: d.ok
                      ? Palette.cyan
                      : d.info
                      ? const Color(0xff8fb8e0)
                      : const Color(0xffffa45c),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    d.text,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: d.ok
                          ? const Color(0xff7fe9f5)
                          : const Color(0xffffc9a3),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    ],
  );

  /// Light Markdown from the assistant: paragraphs, "- " lists, **bold** and
  /// links to site pages (they open the matching app screen).
  List<Widget> _rich(String text) {
    final out = <Widget>[];
    for (final raw in text.split('\n')) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      final item = RegExp(r'^(?:[-*•]|\d+[.)])\s+(.*)$').firstMatch(line);
      final spans = _inline(
        item?.group(1) ?? line.replaceFirst(RegExp(r'^#+\s*'), ''),
      );
      final para = Text.rich(TextSpan(children: spans), style: _bubbleText);
      out.add(
        Padding(
          padding: EdgeInsets.only(
            top: out.isEmpty ? 0 : (item != null ? 3 : 7),
          ),
          child: item == null
              ? para
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('•  ', style: _bubbleText),
                    Expanded(child: para),
                  ],
                ),
        ),
      );
    }
    return out;
  }

  List<InlineSpan> _inline(String line) {
    final spans = <InlineSpan>[];
    final token = RegExp(r'\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)');
    var at = 0;
    for (final m in token.allMatches(line)) {
      if (m.start > at) spans.add(TextSpan(text: line.substring(at, m.start)));
      if (m.group(1) != null) {
        spans.add(
          TextSpan(
            text: m.group(1),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        );
      } else {
        final label = m.group(2)!,
            path = m
                .group(3)!
                .replaceFirst(
                  RegExp(r'^https?://[^/]+', caseSensitive: false),
                  '',
                );
        spans.add(
          AssistController.isPage(path)
              ? WidgetSpan(
                  alignment: PlaceholderAlignment.baseline,
                  baseline: TextBaseline.alphabetic,
                  child: GestureDetector(
                    onTap: () {
                      a.openPath(path);
                      a.minimise();
                    },
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: label),
                          const WidgetSpan(
                            alignment: PlaceholderAlignment.middle,
                            child: Icon(
                              Icons.chevron_right,
                              size: 14,
                              color: Palette.cyan,
                            ),
                          ),
                        ],
                      ),
                      style: const TextStyle(
                        fontSize: 13.5,
                        height: 1.5,
                        color: Palette.cyan,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                        decorationColor: Palette.cyan,
                      ),
                    ),
                  ),
                )
              : TextSpan(text: label),
        );
      }
      at = m.end;
    }
    if (at < line.length) spans.add(TextSpan(text: line.substring(at)));
    return spans;
  }

  Widget _inputRow() => Padding(
    padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
    child: Row(
      children: [
        Expanded(
          child: SizedBox(
            height: 46,
            child: TextField(
              controller: _input,
              maxLength: 600,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              style: const TextStyle(fontSize: 14, color: Color(0xffeef5fc)),
              decoration: InputDecoration(
                hintText: 'Ask 3DEEZI ASSIST...',
                counterText: '',
                fillColor: const Color(0xff070f1b),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0x24ffffff)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(
                    color: Palette.cyan.withValues(alpha: .6),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        ListenableBuilder(
          listenable: _input,
          builder: (context, _) {
            final enabled = !a.busy && _input.text.trim().isNotEmpty;
            return Semantics(
              button: true,
              label: 'Send',
              child: GestureDetector(
                onTap: enabled ? _send : null,
                child: Opacity(
                  opacity: enabled ? 1 : .45,
                  child: Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xff3fd9f8), Color(0xff1fb6ec)],
                      ),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: enabled
                          ? [
                              BoxShadow(
                                color: Palette.cyan.withValues(alpha: .33),
                                blurRadius: 16,
                              ),
                            ]
                          : null,
                    ),
                    child: const Center(
                      child: CustomPaint(
                        size: Size(18, 18),
                        painter: _SendPainter(),
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    ),
  );
}

/// The 3DEEZI four-point sparkle, outlined in cyan with a soft glow.
class Sparkle extends StatelessWidget {
  const Sparkle({super.key, this.size = 24});
  final double size;
  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: const _SparklePainter());
}

class _SparklePainter extends CustomPainter {
  const _SparklePainter();
  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 24;
    canvas.scale(k);
    final path = Path()
      ..moveTo(12, 1.5)
      ..cubicTo(12.7, 7.1, 16.9, 11.3, 22.5, 12)
      ..cubicTo(16.9, 12.7, 12.7, 16.9, 12, 22.5)
      ..cubicTo(11.3, 16.9, 7.1, 12.7, 1.5, 12)
      ..cubicTo(7.1, 11.3, 11.3, 7.1, 12, 1.5)
      ..close();
    canvas
      ..drawPath(path, Paint()..color = Palette.cyan.withValues(alpha: .13))
      ..drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4
          ..color = Palette.cyan.withValues(alpha: .45)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5),
      )
      ..drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..strokeJoin = StrokeJoin.round
          ..color = Palette.cyan,
      );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _SendPainter extends CustomPainter {
  const _SendPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24);
    canvas.drawPath(
      Path()
        ..moveTo(4, 3.5)
        ..lineTo(21, 12)
        ..lineTo(4, 20.5)
        ..lineTo(7, 12)
        ..close(),
      Paint()..color = const Color(0xff03131f),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _TypingDots extends StatefulWidget {
  const _TypingDots();
  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots>
    with SingleTickerProviderStateMixin {
  late final _t = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();
  @override
  void dispose() {
    _t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: '3DEEZI ASSIST is typing',
    child: SizedBox(
      height: 16,
      child: AnimatedBuilder(
        animation: _t,
        builder: (context, _) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2.5),
                child: Opacity(
                  opacity:
                      .3 +
                      .7 *
                          (1 -
                              ((_t.value - i * .16) % 1 - .3).abs().clamp(
                                    0,
                                    .5,
                                  ) *
                                  2),
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Palette.cyan,
                    ),
                    child: SizedBox(width: 7, height: 7),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
