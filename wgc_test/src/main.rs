fn main() {
    let _ = windows::Win32::System::WinRT::Direct3D11::IDirect3DDxgiInterfaceAccess::GetInterface::<windows::Win32::Graphics::Direct3D11::ID3D11Texture2D>;
}
