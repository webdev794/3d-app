{{flutter_js}}
{{flutter_build_config}}

// The CanvasKit engine files come with the app (build/web/canvaskit), not from
// Google's file server: a slow connection there once stopped the app starting.
_flutter.loader.load({
  config: { canvasKitBaseUrl: "canvaskit/" },
});
