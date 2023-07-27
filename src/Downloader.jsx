import React, { useState, useEffect } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import parseHls from './parseHls';
import './App.css'
import Swal from 'sweetalert2';

import { Progress } from 'react-sweet-progress';
import "react-sweet-progress/lib/style.css";

import 'vidstack/styles/defaults.css'
import 'vidstack/styles/community-skin/video.css'

import { defineCustomElements } from 'vidstack/elements';

// the `.js` extension is required.
import 'vidstack/define/media-player.js';


defineCustomElements();



const Downloader = () => {
  const [additionalMessage, setAdditionalMessage] = useState('');
  const [downloadBlobUrl, setDownloadBlobUrl] = useState('');

  //url .m3u8
  const [url, setUrl] = useState('');

  const [percent_download, setPercentdownload] = useState(0);


  //convert (get from extention)
  function hex_to_ascii(str1) {
    var hex = str1.toString();
    var str = '';
    for (var n = 0; n < hex.length; n += 2) {
      str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
    }
    return str;
  }


  useEffect(() => {
    const get_link_m3u8 = window.location.search;
    const Param_link = new URLSearchParams(get_link_m3u8);
    const url_ = Param_link.get('url');

    if (url_) {
      const url_con = hex_to_ascii(url_);
      console.log(url_con);
      setUrl(url_con);
    } else {
      console.log('[err] not have url');
    }
  }, []); // Empty dependency array ensures the code runs only once on component mount


  //sweet alert fuction
  const infoAlert = (msg) => {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
      }
    })
    
    Toast.fire({
      icon: 'success',
      title: msg
    })
  };

  //start converting
  async function startDownload() {
    setAdditionalMessage('STARTING_DOWNLOAD');
    setAdditionalMessage('[INFO] Job started');

    infoAlert('[INFO] Job started')
    
    try {
      setAdditionalMessage('[INFO] Fetching segments');
      infoAlert('[INFO] Fetching segments')
      const getSegments = await parseHls({ hlsUrl: url, headers: '' });
      if (getSegments.type !== 'SEGMENT')
        throw new Error('Invalid segment URL. Please refresh the page.');

      const segments = getSegments.data.map((s, i) => ({ ...s, index: i }));

      setAdditionalMessage('[INFO] Initializing ffmpeg');
      infoAlert('Initializing ffmpeg...')
      const ffmpeg = createFFmpeg({
        mainName: 'main',
        corePath:
          'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
        log: true,
      });

      await ffmpeg.load();
      setAdditionalMessage('[SUCCESS] ffmpeg loaded');
      infoAlert('[SUCCESS] ffmpeg loaded')

      setAdditionalMessage('SEGMENT_STARTING_DOWNLOAD');
      infoAlert('STARTING_DOWNLOAD...')

      const segmentChunks = [];
      for (let i = 0; i < segments.length; i += 10) {
        segmentChunks.push(segments.slice(i, i + 10));
      }

      const successSegments = [];

      for (let i = 0; i < segmentChunks.length; i++) {
        setAdditionalMessage(`[INFO] Downloading segment chunks ${i}/${segmentChunks.length}`);
        console.log(`[INFO] Downloading segment chunks ${i}/${segmentChunks.length}`);

        //cal percent

        let percent_of_segment = (((i+1)/segmentChunks.length)*100);

        setPercentdownload(percent_of_segment);

        
        const segmentChunk = segmentChunks[i];

        await Promise.all(
          segmentChunk.map(async (segment) => {
            try {
              const fileId = `${segment.index}.ts`;
              const getFile = await fetch(segment.uri);
              if (!getFile.ok) throw new Error('File failed to fetch');

              ffmpeg.FS(
                'writeFile',
                fileId,
                await fetchFile(await getFile.arrayBuffer())
              );
              successSegments.push(fileId);
              setAdditionalMessage(`[SUCCESS] Segment downloaded ${segment.index}`);
            } catch (error) {
              setAdditionalMessage(`[ERROR] Segment download error ${segment.index}`);
            }
          })
        );
      }

      successSegments.sort((a, b) => {
        const aIndex = parseInt(a.split('.')[0]);
        const bIndex = parseInt(b.split('.')[0]);
        return aIndex - bIndex;
      });

      setAdditionalMessage('successSegments', successSegments);
      setAdditionalMessage('[INFO] Stitching segments started');
      setAdditionalMessage('SEGMENT_STITCHING');

      console.log("SEGMENT")


      const files = "0.ts|1.ts|2.ts|3.ts|4.ts|5.ts|6.ts|7.ts|8.ts|9.ts|10.ts"
      const files2 = "11.ts|12.ts|13.ts|14.ts|15.ts|16.ts|17.ts|18.ts|19.ts|20.ts|21.ts"
    
      try {
        //successSegments.join('|')
          await ffmpeg.run(
            '-i',
            `concat:${successSegments.join('|')}`,
            '-c',
            'copy',
            'output.mp4' // Change output file name as desired
          );
      
        console.log('Output file 1 (output.mp4) created successfully.');

      } catch (error) {
        console.error('Error executing ffmpeg command:', error);
      }
      

      setAdditionalMessage('[INFO] Stitching segments finished');

      successSegments.forEach((segment) => {
        try {
          ffmpeg.FS('unlink', segment);
        } catch (_) {}
      });

      const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunk size[]

      try {
        const file = ffmpeg.FS('readFile', 'output.mp4');
        const fileSize = file.length;

        let offset = 0;
        const chunks = [];

        while (offset < fileSize) {
          const chunk = file.subarray(offset, offset + CHUNK_SIZE);
          chunks.push(chunk);
          offset += CHUNK_SIZE;
        }

        console.log(chunks)

        const blob = new Blob(chunks, { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        console.log(url);

        setAdditionalMessage('');
        setAdditionalMessage('JOB_FINISHED');
        infoAlert('JOB_FINISHED')
        setDownloadBlobUrl(url);

        setTimeout(() => {
          ffmpeg.exit();
        }, 5000);
      } catch (error) {
        throw new Error('Something went wrong while stitching!');
      }

      
    } catch (error) {
      setAdditionalMessage('');
      setAdditionalMessage('DOWNLOAD_ERROR');
      infoAlert(error.message)
      infoAlert('DOWNLOAD_ERROR')
      console.log(error.message);
    }
  }

  return (
    <div>
      <input 
        className='text-box'
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter HLS video URL"
      />

      {percent_download > 0&&
      (
          <Progress
          className='progress'
          percent={percent_download}
          status="error"
          theme={{
            error: {
              symbol: '🚶',
              color: '#adff2f'
            }
          }}
        />

      )}

      <div className='button-start-download'>
        <button onClick={startDownload}>Download HLS Video</button>
        {additionalMessage && <p className='text-log-download'>{additionalMessage}</p>}
      </div>

      {downloadBlobUrl && (
        <div className="flex gap-2 items-center">
          <a
            href={downloadBlobUrl}
            download={`hls-downloader-${new Date().toLocaleDateString().replace(/\//g, '-')}.mp4`}
            className="Button-download"
          >
            Download now
          </a>

          <button
            onClick={() => window.location.reload()}
            className=""
          >
            Create new
          </button>
        </div>
      )}

      <div>
      {url && (
        <h2>Preview</h2>
      )}
      { url && (
        
        <media-player
        title="Sprite Fight"
        src={url}
        poster="https://image.mux.com/VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU/thumbnail.webp?time=268&width=980"
        thumbnails=''
        aspect-ratio="16/9"
        crossorigin
      >
        <media-outlet>
        </media-outlet>
        <media-community-skin></media-community-skin>
      </media-player>
      
         
      )}

      </div>


    </div>
    
  );
};

export default Downloader;