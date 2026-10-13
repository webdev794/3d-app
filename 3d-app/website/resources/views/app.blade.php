<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="app-base" content="{{ rtrim(url('/'), '/') }}" />
        <meta name="theme-color" content="#060b13" />
        <meta name="description" content="Design your next team kit with 3DEEZI. Explore sportswear concepts, customise your kit in 3D, and keep every design in your studio." />
        <title>3DEEZI — Your sport. Your way.</title>
        @viteReactRefresh
        @vite('resources/js/main.tsx')
    </head>
    <body>
        <div id="root"></div>
    </body>
</html>
