FROM debian:trixie AS builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -qq && \
	apt-get install -y --no-install-recommends \
		ca-certificates git build-essential cmake autoconf automake libtool libao-dev libfftw3-dev librtlsdr-dev && \
	apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone https://github.com/theori-io/nrsc5.git && \
	cd nrsc5 && mkdir build && cd build && \
	cmake .. && make && make install && ldconfig

RUN git clone https://github.com/evuraan/yellowShoes.git -b yellowShoes_with_Webamp_Milkdrop --depth 1

FROM debian:trixie-slim
LABEL maintainer="evuraan <evuraan@gmail.com>"
ENV DEBIAN_FRONTEND=noninteractive

# Install only runtime libraries (no build deps)
RUN apt-get update -qq && \
	apt-get install -y --no-install-recommends \
		ca-certificates libao4 libfftw3-bin librtlsdr0 lame && \
	apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy nrsc5 from builder stage
COPY --from=builder /usr/local/bin/nrsc5 /usr/local/bin/

# Copy the prebuilt yellowShoes binary from the repository context
COPY --from=builder /build/yellowShoes/bin/yellowShoes-linux-amd64 /opt/yellowShoes/bin/yellowShoes-linux-amd64
RUN chmod +x /opt/yellowShoes/bin/yellowShoes-linux-amd64 || true

EXPOSE 8113
WORKDIR /opt/yellowShoes/bin
#USER nobody # this doesn't work for USB access when running in privileged mode
CMD ["./yellowShoes-linux-amd64","-enableAlbumArt"]
