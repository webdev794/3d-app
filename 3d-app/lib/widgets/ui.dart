import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../app_controller.dart';

class Palette {
  static const bg = Color(0xff05090d),
      surface = Color(0xff0e171f),
      surface2 = Color(0xff17232f),
      border = Color(0xff293c4b),
      muted = Color(0xff8d9daa),
      cyan = Color(0xff00dbea),
      blue = Color(0xff0078ff),
      text = Color(0xfff4f8fb);
}

/// The client's 3DEEZI wordmark (transparent PNG). With [tagline], the
/// version with "AI SPORTSWEAR DESIGNER" lettering under it.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.width = 150, this.tagline = false});
  final double width;
  final bool tagline;
  @override
  Widget build(BuildContext context) => Image.asset(
    tagline ? 'assets/images/brand_tagline.png' : 'assets/images/brand.png',
    width: width,
    fit: BoxFit.contain,
    filterQuality: FilterQuality.high,
  );
}

class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.compact = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool compact;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    enabled: onPressed != null,
    child: DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        gradient: LinearGradient(
          colors: onPressed == null
              ? [Palette.surface2, Palette.border]
              : [Palette.cyan, Palette.blue],
        ),
        boxShadow: onPressed == null
            ? []
            : [
                BoxShadow(
                  color: Palette.cyan.withValues(alpha: .09),
                  blurRadius: 20,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(13),
          onTap: onPressed,
          child: SizedBox(
            height: compact ? 40 : 52,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 20),
              child: Row(
                mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (label.isNotEmpty)
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xff001923),
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  if (icon != null) ...[
                    if (label.isNotEmpty) const SizedBox(width: 10),
                    Icon(icon, size: 19, color: const Color(0xff001923)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });
  final String label;
  final VoidCallback onPressed;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 51,
    width: double.infinity,
    child: OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        backgroundColor: Palette.surface,
        side: BorderSide(
          color: Palette.cyan.withValues(alpha: .65),
          width: 1.5,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 20),
            const SizedBox(width: 10),
          ],
          Text(
            label,
            style: const TextStyle(
              color: Palette.text,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    ),
  );
}

class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.onBack,
    this.actions = const [],
  });
  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(10, 10, 15, 16),
    child: Row(
      children: [
        if (onBack != null)
          IconButton(
            tooltip: 'Go back',
            onPressed: onBack,
            icon: const Icon(
              Icons.arrow_back_ios_new_rounded,
              color: Palette.cyan,
              size: 19,
            ),
          ),
        Expanded(
          child: Column(
            crossAxisAlignment: onBack == null
                ? CrossAxisAlignment.start
                : CrossAxisAlignment.center,
            children: [
              Text(
                title.toUpperCase(),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: .4,
                ),
              ),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    subtitle!,
                    style: const TextStyle(color: Palette.muted, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        ),
        ...actions,
        if (onBack != null && actions.isEmpty) const SizedBox(width: 40),
      ],
    ),
  );
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final String? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
              color: Color(0xffc1cbd4),
            ),
          ),
        ),
        if (trailing != null)
          Text(
            trailing!,
            style: const TextStyle(color: Palette.cyan, fontSize: 11),
          ),
      ],
    ),
  );
}

class SurfaceCard extends StatelessWidget {
  const SurfaceCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.selected = false,
  });
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final bool selected;
  @override
  Widget build(BuildContext context) => Material(
    color: selected ? const Color(0xff0b2732) : Palette.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: BorderSide(
        color: selected ? Palette.cyan : Palette.border,
        width: selected ? 1.5 : 1,
      ),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(padding: padding, child: child),
    ),
  );
}

class BottomNav extends StatelessWidget {
  const BottomNav({super.key, required this.controller});
  final AppController controller;
  @override
  Widget build(BuildContext context) {
    final entries = [
      (AppScreen.home, Icons.auto_awesome_outlined, 'Create'),
      (AppScreen.projects, Icons.folder_outlined, 'Projects'),
      (AppScreen.assets, Icons.layers_outlined, 'Assets'),
      (AppScreen.profile, Icons.person_outline_rounded, 'Profile'),
    ];
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xff080e14),
        border: Border(top: BorderSide(color: Palette.border)),
      ),
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 5),
      child: Row(
        children: entries.map((e) {
          final selected = controller.screen == e.$1;
          return Expanded(
            child: InkWell(
              onTap: () => controller.go(e.$1),
              borderRadius: BorderRadius.circular(10),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      e.$2,
                      color: selected ? Palette.cyan : Palette.muted,
                      size: 22,
                    ),
                    const SizedBox(height: 5),
                    Text(
                      e.$3,
                      style: TextStyle(
                        color: selected ? Palette.cyan : Palette.muted,
                        fontSize: 10,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

void showToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context).hideCurrentSnackBar();
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.surface2,
      showCloseIcon: true,
      duration: const Duration(seconds: 3),
    ),
  );
}

class GarmentPreview extends StatefulWidget {
  const GarmentPreview({
    super.key,
    required this.controller,
    this.height = 300,
    this.showStage = true,
  });
  final AppController controller;
  final double height;
  final bool showStage;
  @override
  State<GarmentPreview> createState() => _GarmentPreviewState();
}

class _GarmentPreviewState extends State<GarmentPreview>
    with SingleTickerProviderStateMixin {
  late final AnimationController rotation = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 8),
  );
  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant GarmentPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    if (widget.controller.view == '360°' || widget.controller.view == '360') {
      if (!rotation.isAnimating) rotation.repeat();
    } else {
      rotation.stop();
    }
  }

  @override
  void dispose() {
    rotation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label:
        '${widget.controller.sport} ${widget.controller.garment}, ${widget.controller.view} illustrative mock-up',
    child: SizedBox(
      height: widget.height,
      width: double.infinity,
      child: AnimatedBuilder(
        animation: rotation,
        builder: (context, child) => CustomPaint(
          painter: JerseyPainter(
            widget.controller,
            stage: widget.showStage,
            angle: rotation.value * math.pi * 2,
          ),
        ),
      ),
    ),
  );
}

class JerseyPainter extends CustomPainter {
  JerseyPainter(this.c, {this.stage = true, this.angle = 0});
  final AppController c;
  final bool stage;
  final double angle;
  @override
  void paint(Canvas canvas, Size size) {
    final scale = math.min(size.width / 360, size.height / 390);
    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(scale);
    canvas.translate(-180, -188);
    if (stage) {
      canvas.drawCircle(
        const Offset(180, 210),
        172,
        Paint()
          ..shader = RadialGradient(
            colors: [
              c.secondaryColor.withValues(alpha: .19),
              c.secondaryColor.withValues(alpha: .02),
              Colors.transparent,
            ],
          ).createShader(const Rect.fromLTWH(8, 38, 344, 344)),
      );
      for (var i = 0; i < 4; i++) {
        canvas.drawOval(
          Rect.fromCenter(
            center: const Offset(180, 355),
            width: 150 + i * 45,
            height: 12 + i * 8,
          ),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = i == 0 ? 1.5 : .6
            ..color = c.secondaryColor.withValues(alpha: .4 - i * .08),
        );
      }
      canvas.drawOval(
        const Rect.fromLTWH(102, 345, 156, 14),
        Paint()
          ..color = Colors.black.withValues(alpha: .7)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
      );
    }
    final spinning = c.view.startsWith('360');
    final side = c.view == 'Side';
    final back = c.view == 'Back' || (spinning && math.cos(angle) < 0);
    final factor = spinning
        ? .28 + .72 * math.cos(angle).abs()
        : (side ? .42 : 1.0);
    canvas.save();
    canvas.translate(180, 0);
    canvas.scale(factor, 1);
    canvas.translate(-180, 0);
    final isShorts = c.garment == 'Shorts';
    final isCap = c.garment == 'Hat / Cap';
    if (isCap) {
      _cap(canvas);
      canvas.restore();
      canvas.restore();
      return;
    }
    if (isShorts) {
      _shorts(canvas);
      canvas.restore();
      canvas.restore();
      return;
    }
    final singlet = c.garment == 'Singlet';
    final long = ['Hoodie', 'Jacket', 'Tracksuit'].contains(c.garment);
    final path = Path()
      ..moveTo(135, 48)
      ..quadraticBezierTo(180, 62, 225, 48)
      ..lineTo(267, 68);
    if (singlet) {
      path.lineTo(256, 131);
      path.quadraticBezierTo(241, 151, 247, 172);
    } else {
      path.lineTo(314, long ? 252 : 133);
      path.lineTo(267, long ? 268 : 156);
      path.lineTo(245, 122);
    }
    path.lineTo(251, 323);
    path.quadraticBezierTo(180, 338, 109, 323);
    path.lineTo(115, 122);
    if (singlet) {
      path.quadraticBezierTo(119, 147, 104, 131);
      path.lineTo(93, 68);
    } else {
      path.lineTo(93, long ? 268 : 156);
      path.lineTo(46, long ? 252 : 133);
      path.lineTo(93, 68);
    }
    path.close();
    canvas.drawPath(
      path,
      Paint()
        ..color = c.secondaryColor.withValues(alpha: .4)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          colors: [
            Color.lerp(c.mainColor, Colors.white, .16)!,
            c.mainColor,
            Color.lerp(c.mainColor, Colors.black, .4)!,
            Color.lerp(c.mainColor, Colors.white, .12)!,
          ],
          stops: const [0, .3, .65, 1],
        ).createShader(const Rect.fromLTWH(45, 40, 270, 300)),
    );
    canvas.save();
    canvas.clipPath(path);
    final panel = Path()
      ..moveTo(100, 78)
      ..lineTo(128, 107)
      ..lineTo(139, 323)
      ..lineTo(106, 332)
      ..close();
    canvas.drawPath(
      panel,
      Paint()..color = c.secondaryColor.withValues(alpha: .8),
    );
    canvas.save();
    canvas.translate(360, 0);
    canvas.scale(-1, 1);
    canvas.drawPath(
      panel,
      Paint()..color = c.secondaryColor.withValues(alpha: .8),
    );
    canvas.restore();
    if (c.pattern != 'Solid' && c.pattern != 'None') {
      final patternPaint = Paint()
        ..color = c.secondaryColor.withValues(alpha: .25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2;
      for (
        var y = 65.0;
        y < 350 && c.pattern != 'Stripes';
        y += c.pattern == 'Chevron' ? 24 : 14
      ) {
        final p = Path()
          ..moveTo(85, y)
          ..lineTo(125, y + 12)
          ..lineTo(149, y + 8)
          ..lineTo(180, y + 35)
          ..lineTo(211, y + 8)
          ..lineTo(235, y + 12)
          ..lineTo(275, y);
        canvas.drawPath(p, patternPaint);
      }
      if (c.pattern == 'Stripes') {
        for (var x = 90.0; x < 280; x += 24) {
          canvas.drawLine(
            Offset(x, 60),
            Offset(x, 330),
            Paint()
              ..color = c.secondaryColor.withValues(alpha: .4)
              ..strokeWidth = 8,
          );
        }
      }
    }
    for (final x in [122.0, 143.0, 223.0, 242.0]) {
      canvas.drawPath(
        Path()
          ..moveTo(x, 135)
          ..quadraticBezierTo(x - 8, 243, x + 1, 319),
        Paint()
          ..style = PaintingStyle.stroke
          ..color = Colors.white.withValues(alpha: .06)
          ..strokeWidth = 3,
      );
    }
    canvas.drawLine(
      Offset(40, long ? 249 : 133),
      Offset(100, long ? 268 : 153),
      Paint()
        ..color = c.secondaryColor
        ..strokeWidth = 11,
    );
    canvas.drawLine(
      Offset(260, long ? 268 : 153),
      Offset(321, long ? 249 : 133),
      Paint()
        ..color = c.secondaryColor
        ..strokeWidth = 11,
    );
    canvas.drawPath(
      Path()
        ..moveTo(108, 317)
        ..quadraticBezierTo(180, 332, 252, 317),
      Paint()
        ..color = c.secondaryColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4,
    );
    canvas.restore();
    canvas.drawPath(
      path,
      Paint()
        ..color = Color.lerp(
          c.secondaryColor,
          Colors.white,
          .2,
        )!.withValues(alpha: .65)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1,
    );
    final collar = Path()
      ..moveTo(135, 48)
      ..quadraticBezierTo(180, 62, 225, 48)
      ..quadraticBezierTo(220, 78, 180, back ? 80 : 99)
      ..quadraticBezierTo(140, 78, 135, 48)
      ..close();
    canvas.drawPath(collar, Paint()..color = const Color(0xff070c12));
    canvas.drawPath(
      collar,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..color = c.secondaryColor,
    );
    canvas.drawPath(
      Path()
        ..moveTo(142, 53)
        ..quadraticBezierTo(180, 65, 218, 53),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = c.accentColor.withValues(alpha: .7),
    );
    if (c.garment == 'Hoodie') {
      canvas.drawPath(
        Path()
          ..moveTo(138, 57)
          ..quadraticBezierTo(127, 13, 180, 20)
          ..quadraticBezierTo(233, 13, 222, 57),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 17
          ..color = c.mainColor,
      );
    }
    if (back) {
      _text(
        canvas,
        '3DEEZI',
        180,
        113,
        16,
        c.accentColor,
        weight: FontWeight.w600,
      );
      _text(canvas, '23', 180, 145, 96, c.accentColor, weight: FontWeight.w800);
    } else {
      _text(canvas, '3D', 139, 113, 12, c.accentColor, weight: FontWeight.w800);
      final crest = Path()
        ..moveTo(219, 110)
        ..lineTo(229, 123)
        ..lineTo(219, 133)
        ..lineTo(209, 123)
        ..close();
      canvas.drawPath(
        crest,
        Paint()
          ..color = c.accentColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      _text(canvas, 'M', 219, 115, 11, c.accentColor, weight: FontWeight.bold);
      _text(
        canvas,
        c.logoText.toUpperCase(),
        180,
        162,
        c.logoText.length > 10 ? 19 : 27,
        c.accentColor,
        weight: FontWeight.w800,
      );
      _text(
        canvas,
        'PERFORMANCE APPAREL',
        180,
        197,
        6.7,
        c.accentColor.withValues(alpha: .7),
        spacing: 1.8,
      );
      if (c.garment == 'Jacket' || c.garment == 'Tracksuit') {
        canvas.drawLine(
          const Offset(180, 89),
          const Offset(180, 327),
          Paint()
            ..color = c.accentColor.withValues(alpha: .5)
            ..strokeWidth = 2,
        );
      }
    }
    canvas.restore();
    canvas.restore();
  }

  void _shorts(Canvas canvas) {
    final path = Path()
      ..moveTo(110, 100)
      ..lineTo(250, 100)
      ..lineTo(265, 290)
      ..lineTo(190, 302)
      ..lineTo(180, 207)
      ..lineTo(170, 302)
      ..lineTo(95, 290)
      ..close();
    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          colors: [c.mainColor, Color.lerp(c.mainColor, Colors.white, .2)!],
        ).createShader(const Rect.fromLTWH(95, 100, 170, 202)),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = c.secondaryColor
        ..strokeWidth = 4,
    );
    canvas.drawLine(
      const Offset(110, 116),
      const Offset(250, 116),
      Paint()
        ..color = c.secondaryColor
        ..strokeWidth = 8,
    );
    _text(canvas, '3D', 224, 242, 20, c.accentColor);
  }

  void _cap(Canvas canvas) {
    final path = Path()
      ..moveTo(87, 218)
      ..quadraticBezierTo(90, 100, 183, 100)
      ..quadraticBezierTo(270, 112, 274, 218)
      ..close();
    canvas.drawPath(path, Paint()..color = c.mainColor);
    canvas.drawPath(
      path,
      Paint()
        ..color = c.secondaryColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
    canvas.drawOval(
      const Rect.fromLTWH(120, 200, 192, 61),
      Paint()..color = c.secondaryColor,
    );
    _text(canvas, '3D', 179, 158, 38, c.accentColor, weight: FontWeight.w800);
  }

  void _text(
    Canvas canvas,
    String text,
    double x,
    double y,
    double size,
    Color color, {
    FontWeight weight = FontWeight.w500,
    double spacing = 0,
  }) {
    final p = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: size,
          fontWeight: weight,
          letterSpacing: spacing,
          fontFamily: 'Inter',
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 200);
    p.paint(canvas, Offset(x - p.width / 2, y));
  }

  @override
  bool shouldRepaint(covariant JerseyPainter oldDelegate) => true;
}

/// The AI render when one exists for the current view, otherwise the editable
/// vector illustration.
class KitPreview extends StatelessWidget {
  const KitPreview({
    super.key,
    required this.controller,
    this.height = 300,
    this.showStage = true,
  });
  final AppController controller;
  final double height;
  final bool showStage;

  @override
  Widget build(BuildContext context) {
    final render = controller.showRender ? controller.currentRender : null;
    if (render == null) {
      return GarmentPreview(
        controller: controller,
        height: height,
        showStage: showStage,
      );
    }
    return SizedBox(
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Palette.cyan.withValues(alpha: 0.16),
              blurRadius: 40,
              spreadRadius: -8,
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Image.memory(
            render,
            fit: BoxFit.contain,
            gaplessPlayback: true,
            filterQuality: FilterQuality.high,
            semanticLabel:
                'AI render, ${controller.view.toLowerCase()} of the '
                '${controller.garment}',
          ),
        ),
      ),
    );
  }
}

/// Small floating progress label shown over a preview during AI work.
class BusyBadge extends StatelessWidget {
  const BusyBadge(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: Palette.bg.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Palette.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2, color: Palette.cyan),
        ),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontSize: 11)),
      ],
    ),
  );
}
