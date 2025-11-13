@echo off

if exist .private (
  for /f "tokens=1,2 delims==" %%a in (.private) do (
    if not "%%a"=="#" (
      if not "%%a"=="" (
        set %%a=%%b
      )
    )
  )
)

set BOOST_DIR=C:\opt\boost_1_88_0
set OPENSSL_DIR=C:\Program Files\OpenSSL

cmake -S . -B .build_local\win -G "Visual Studio 17 2022" ^
  -DOPT_NPRPC_SKIP_TESTS=ON
