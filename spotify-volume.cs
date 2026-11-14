using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class SpotifyVolume {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class DeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDevices {
        void EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
        void GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDevice {
        void Activate(ref Guid type, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISessions {
        void GetAudioSessionControl(IntPtr session, int flags, out IntPtr control);
        void GetSimpleAudioVolume(IntPtr session, int flags, out IntPtr volume);
        void GetSessionEnumerator(out ISessionList list);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISessionList {
        void GetCount(out int count);
        void GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISession {
        void GetState(out int state);
        void GetDisplayName(out IntPtr name);
        void SetDisplayName(IntPtr name, IntPtr context);
        void GetIconPath(out IntPtr path);
        void SetIconPath(IntPtr path, IntPtr context);
        void GetGroupingParam(out Guid group);
        void SetGroupingParam(ref Guid group, IntPtr context);
        void RegisterAudioSessionNotification(IntPtr client);
        void UnregisterAudioSessionNotification(IntPtr client);
        void GetSessionIdentifier(out IntPtr identifier);
        void GetSessionInstanceIdentifier(out IntPtr identifier);
        [PreserveSig] int GetProcessId(out uint id);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IVolume {
        void SetMasterVolume(float value, IntPtr context);
        void GetMasterVolume(out float value);
        void SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, IntPtr context);
        void GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    }

    public static int Access(int level, int mute) {
        IDevice device;
        ((IDevices)new DeviceEnumerator()).GetDefaultAudioEndpoint(0, 1, out device);
        var iid = typeof(ISessions).GUID;
        object manager;
        device.Activate(ref iid, 23, IntPtr.Zero, out manager);
        ISessionList sessions;
        ((ISessions)manager).GetSessionEnumerator(out sessions);
        int count, result = -1, bestState = -1;
        sessions.GetCount(out count);
        for (int i = 0; i < count; i++) {
            object entry;
            sessions.GetSession(i, out entry);
            var session = (ISession)entry;
            uint pid;
            int state;
            session.GetState(out state);
            if (state == 2 || session.GetProcessId(out pid) < 0 || pid == 0) continue;
            try {
                using (var process = Process.GetProcessById((int)pid))
                    if (!String.Equals(process.ProcessName, "Spotify", StringComparison.OrdinalIgnoreCase)) continue;
            } catch (ArgumentException) { continue; }
            var volume = (IVolume)entry;
            if (level >= 0) volume.SetMasterVolume(level / 100f, IntPtr.Zero);
            if (mute >= 0) volume.SetMute(mute == 1, IntPtr.Zero);
            if (state < bestState) continue;
            float current;
            bool muted;
            volume.GetMasterVolume(out current);
            volume.GetMute(out muted);
            result = (int)Math.Round(current * 100) + (muted ? 101 : 0);
            bestState = state;
        }
        return result;
    }
}
