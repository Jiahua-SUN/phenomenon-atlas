"""Exercise real listening and recently closed TCP sockets."""
from pathlib import Path
import os, socket, sys, unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from launch import check_port

class PortTests(unittest.TestCase):
    def test_existing_listener_is_rejected(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen()
            with self.assertRaises(SystemExit): check_port(listener.getsockname()[1])

    @unittest.skipIf(os.name=='nt','Unix TCP address reuse')
    def test_restart_after_server_closes_connection(self):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            listener.bind(('127.0.0.1',0));listener.listen()
            port=listener.getsockname()[1]
            with socket.create_connection(('127.0.0.1',port)) as client:
                server,_=listener.accept()
                server.shutdown(socket.SHUT_WR)
                self.assertEqual(client.recv(1),b'')
                client.shutdown(socket.SHUT_WR)
                self.assertEqual(server.recv(1),b'')
                server.close()
        check_port(port)

if __name__=='__main__':unittest.main()
