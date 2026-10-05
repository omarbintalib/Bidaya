"""server.english_honorific. cd backend/pipeline && python -m unittest test_honorific (needs fastapi)"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import english_honorific as fix


class Honorific(unittest.TestCase):
    def test_doubled_keeps_the_english(self):
        self.assertEqual(fix('Aisha رضي الله عنها (may Allah be pleased with her) was six.'), 'Aisha (may Allah be pleased with her) was six.')
        self.assertEqual(fix('Umar (may Allah be pleased with him) رضي الله عنه asked.'), 'Umar (may Allah be pleased with him) asked.')

    def test_arabic_alone_becomes_english(self):
        self.assertEqual(fix('Salman al-Farsi رضي الله عنه proposed it.'), 'Salman al-Farsi (may Allah be pleased with him) proposed it.')
        self.assertEqual(fix('Khadijah رضي الله عنها died.'), 'Khadijah (may Allah be pleased with her) died.')
        self.assertEqual(fix('Abu Bakr and Umar رضي الله عنهما went.'), 'Abu Bakr and Umar (may Allah be pleased with them) went.')

    def test_untouched_otherwise(self):
        self.assertEqual(fix('The Prophet ﷺ prayed.'), 'The Prophet ﷺ prayed.')


if __name__ == '__main__':
    unittest.main()
