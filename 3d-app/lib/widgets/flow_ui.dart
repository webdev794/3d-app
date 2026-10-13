import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'ui.dart';

/// Rajdhani display title; [highlight] (a trailing part) is drawn in cyan,
/// as in "HOW DO YOU WANT TO **CREATE?**".
class ScreenTitle extends StatelessWidget {
  const ScreenTitle(
    this.text, {
    super.key,
    this.highlight,
    this.size = 24,
    this.align = TextAlign.center,
  });
  final String text;
  final String? highlight;
  final double size;
  final TextAlign align;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: 'Rajdhani',
      fontWeight: FontWeight.w700,
      fontSize: size,
      height: 1.05,
      letterSpacing: .6,
      color: Palette.text,
    );
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          TextSpan(text: text.toUpperCase()),
          if (highlight != null)
            TextSpan(
              text: highlight!.toUpperCase(),
              style: style.copyWith(color: Palette.cyan),
            ),
        ],
      ),
      textAlign: align,
    );
  }
}

/// Small spaced caption under titles ("AI SPORTSWEAR DESIGNER").
class Caption extends StatelessWidget {
  const Caption(this.text, {super.key, this.color = Palette.cyan});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    textAlign: TextAlign.center,
    style: TextStyle(
      color: color,
      fontSize: 10,
      letterSpacing: 2.6,
      fontWeight: FontWeight.w600,
    ),
  );
}

/// Back arrow + centred title/child + optional trailing actions.
class TopBar extends StatelessWidget {
  const TopBar({
    super.key,
    this.onBack,
    this.title,
    this.subtitle,
    this.center,
    this.trailing = const [],
  });
  final VoidCallback? onBack;
  final String? title, subtitle;
  final Widget? center;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 6, 10, 6),
    child: SizedBox(
      height: subtitle == null ? 48 : 58,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 52),
              child: Center(
                child:
                    center ??
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (title != null) ScreenTitle(title!, size: 21),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle!,
                            style: const TextStyle(
                              color: Palette.muted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ],
                    ),
              ),
            ),
          ),
          if (onBack != null)
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                tooltip: 'Back',
                onPressed: onBack,
                icon: const Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size: 19,
                  color: Palette.text,
                ),
              ),
            ),
          if (trailing.isNotEmpty)
            Align(
              alignment: Alignment.centerRight,
              child: Row(mainAxisSize: MainAxisSize.min, children: trailing),
            ),
        ],
      ),
    ),
  );
}

/// The mockup's glowing card: image fill, cyan edge and outer glow.
class GlowCard extends StatelessWidget {
  const GlowCard({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.selected = false,
    this.radius = 16,
    this.glow = true,
  });
  final Widget child;
  final VoidCallback? onTap, onLongPress;
  final bool selected, glow;
  final double radius;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      boxShadow: glow
          ? [
              BoxShadow(
                color: Palette.cyan.withValues(alpha: selected ? .5 : .18),
                blurRadius: selected ? 24 : 16,
                spreadRadius: -2,
              ),
            ]
          : null,
    ),
    child: Material(
      color: const Color(0xff07121b),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
        side: BorderSide(
          color: selected
              ? Palette.cyan
              : Palette.cyan.withValues(alpha: glow ? .45 : .2),
          width: selected ? 2.5 : 1.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, onLongPress: onLongPress, child: child),
    ),
  );
}

/// Pill chip used for quick actions ("Inspire", "Make it black").
class ActionChipPill extends StatelessWidget {
  const ActionChipPill(
    this.label, {
    super.key,
    required this.onTap,
    this.selected = false,
    this.icon,
  });
  final String label;
  final VoidCallback? onTap;
  final bool selected;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Material(
    color: selected ? Palette.cyan.withValues(alpha: .16) : Palette.surface,
    shape: StadiumBorder(
      side: BorderSide(color: selected ? Palette.cyan : Palette.border),
    ),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: Palette.cyan),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: selected ? Palette.cyan : Palette.text,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Dots for carousels and onboarding.
class PageDots extends StatelessWidget {
  const PageDots({super.key, required this.count, required this.index});
  final int count, index;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: List.generate(
      count,
      (i) => AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        margin: const EdgeInsets.symmetric(horizontal: 3),
        width: i == index ? 18 : 6,
        height: 6,
        decoration: BoxDecoration(
          color: i == index ? Palette.cyan : Palette.border,
          borderRadius: BorderRadius.circular(4),
        ),
      ),
    ),
  );
}

/// Shows bundled art or in-memory bytes with the same fit.
Widget artImage({
  String? asset,
  Uint8List? bytes,
  BoxFit fit = BoxFit.cover,
  Alignment alignment = Alignment.center,
}) {
  if (bytes != null) {
    return Image.memory(
      bytes,
      fit: fit,
      alignment: alignment,
      gaplessPlayback: true,
      filterQuality: FilterQuality.medium,
    );
  }
  if (asset != null) {
    return Image.asset(
      asset,
      fit: fit,
      alignment: alignment,
      filterQuality: FilterQuality.medium,
    );
  }
  return const ColoredBox(color: Palette.surface2);
}

/// Lets the user pick a photo (gallery or camera). Returns null if cancelled.
Future<Uint8List?> pickPhoto(
  BuildContext context, {
  ImageSource? source,
}) async {
  final chosen =
      source ??
      await showModalBottomSheet<ImageSource>(
        context: context,
        backgroundColor: Palette.surface,
        showDragHandle: true,
        builder: (sheet) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Photo library'),
                onTap: () => Navigator.pop(sheet, ImageSource.gallery),
              ),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Camera'),
                onTap: () => Navigator.pop(sheet, ImageSource.camera),
              ),
            ],
          ),
        ),
      );
  if (chosen == null) return null;
  try {
    final file = await ImagePicker().pickImage(
      source: chosen,
      maxWidth: 1536,
      maxHeight: 1536,
      imageQuality: 88,
    );
    return file == null ? null : await file.readAsBytes();
  } on Exception {
    if (context.mounted) showToast(context, 'Could not open the image picker.');
    return null;
  }
}
